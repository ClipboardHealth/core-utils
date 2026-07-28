import { asBoolean, asNumber, asRecord, asString } from "./internal/typeGuards";
import {
  CLIENT_LIFECYCLE_CLASSIFICATION_PRIORITY,
  type BrowserLifecycleClassification,
  sanitizeLifecycleClassification,
  sanitizeLifecycleIdentifier,
  sanitizeLifecycleIpAddress,
  sanitizeLifecycleMethod,
  sanitizeLifecycleNetworkError,
  sanitizeLifecycleNonNegativeNumber,
  sanitizeLifecycleOrigin,
  sanitizeLifecyclePathTemplate,
  sanitizeLifecycleProtocol,
  sanitizeLifecycleSpanId,
  sanitizeLifecycleTraceId,
} from "./internal/clientLifecycleSanitization";

export type { BrowserLifecycleClassification } from "./internal/clientLifecycleSanitization";

const SCHEMA_VERSION = 2;
const MAXIMUM_BYTES = 65_536;
const MAXIMUM_RECORDS = 100;

export const BROWSER_LIFECYCLE_ATTACHMENT_SCHEMA = Object.freeze({
  version: SCHEMA_VERSION,
  maximumBytes: MAXIMUM_BYTES,
  maximumRecords: MAXIMUM_RECORDS,
});

export interface BrowserLifecycleTimestamp {
  utc: string;
  monotonicMilliseconds?: number;
}

export type BrowserLifecycleEvent =
  | {
      cdp: BrowserLifecycleTimestamp;
      playwright?: BrowserLifecycleTimestamp;
    }
  | {
      cdp?: BrowserLifecycleTimestamp;
      playwright: BrowserLifecycleTimestamp;
    };

export interface BrowserLifecycleFailureEvent {
  cdp?: BrowserLifecycleTimestamp;
  playwright?: BrowserLifecycleTimestamp;
  errorText?: string;
  canceled?: boolean;
  blockedReason?: string;
  corsErrorStatus?: string;
}

export interface BrowserLifecycleConnection {
  id?: number;
  reused?: boolean;
  remoteEndpoint?: {
    ipAddress?: string;
    port?: number;
  };
}

export interface BrowserLifecycleEncodedBytes {
  data?: number;
  responseHeaders?: number;
  total?: number;
}

export interface BrowserLifecycleRecord {
  method: string;
  origin: string;
  pathTemplate: string;
  requestStarted: BrowserLifecycleEvent;
  responseReceived?: BrowserLifecycleEvent;
  loadingFinished?: BrowserLifecycleEvent;
  loadingFailed?: BrowserLifecycleFailureEvent;
  playwrightRequestKey?: string;
  cdpRequestId?: string;
  loaderId?: string;
  traceId?: string;
  spanId?: string;
  apiGatewayRequestId?: string;
  protocol?: string;
  connection?: BrowserLifecycleConnection;
  encodedBytes?: BrowserLifecycleEncodedBytes;
  classification: BrowserLifecycleClassification;
}

export interface BrowserLifecycleAttachment {
  schemaVersion: typeof SCHEMA_VERSION;
  truncated: boolean;
  records: BrowserLifecycleRecord[];
}

export interface EncodeBrowserLifecycleAttachmentInput {
  records: readonly BrowserLifecycleRecord[];
  truncated?: boolean;
}

export interface EncodedBrowserLifecycleAttachment {
  body: Buffer;
  attachment: BrowserLifecycleAttachment;
  observedRecordCount: number;
  includedRecordCount: number;
  droppedRecordCount: number;
}

export function encodeBrowserLifecycleAttachment({
  records,
  truncated = false,
}: EncodeBrowserLifecycleAttachmentInput): EncodedBrowserLifecycleAttachment {
  const sanitizedRecords = records
    .map((record) => sanitizeRecord(record))
    .filter((record): record is BrowserLifecycleRecord => record !== undefined);
  const prioritizedRecords = prioritizeRecords(sanitizedRecords);
  const includedRecords: BrowserLifecycleRecord[] = [];
  const emptyAttachmentBytes = Math.max(
    serializeAttachment({ records: [], truncated: false }).body.byteLength,
    serializeAttachment({ records: [], truncated: true }).body.byteLength,
  );
  let includedRecordBytes = 0;

  for (const record of prioritizedRecords) {
    if (includedRecords.length >= MAXIMUM_RECORDS) {
      break;
    }
    const recordBytes = Buffer.byteLength(JSON.stringify(record));
    const separatorBytes = includedRecords.length === 0 ? 0 : 1;
    if (
      emptyAttachmentBytes + includedRecordBytes + separatorBytes + recordBytes <=
      MAXIMUM_BYTES
    ) {
      includedRecords.push(record);
      includedRecordBytes += separatorBytes + recordBytes;
    }
  }

  const droppedRecordCount = records.length - includedRecords.length;
  const { attachment, body } = serializeAttachment({
    records: includedRecords,
    truncated: truncated || droppedRecordCount > 0,
  });

  return {
    body,
    attachment,
    observedRecordCount: records.length,
    includedRecordCount: attachment.records.length,
    droppedRecordCount: records.length - attachment.records.length,
  };
}

export interface ParseBrowserLifecycleAttachmentInput {
  content: Uint8Array;
}

export function parseBrowserLifecycleAttachment({
  content,
}: ParseBrowserLifecycleAttachmentInput): BrowserLifecycleAttachment | undefined {
  if (content.byteLength > MAXIMUM_BYTES) {
    return undefined;
  }

  let parsedValue: unknown;
  try {
    parsedValue = JSON.parse(Buffer.from(content).toString("utf8"));
  } catch {
    return undefined;
  }

  const attachment = asRecord(parsedValue);
  if (!attachment) {
    return undefined;
  }
  const records = attachment["records"];
  if (
    asNumber(attachment["schemaVersion"]) !== SCHEMA_VERSION ||
    !Array.isArray(records) ||
    asBoolean(attachment["truncated"]) === undefined
  ) {
    return undefined;
  }

  const sanitizedRecords: BrowserLifecycleRecord[] = [];
  for (const record of records.slice(0, MAXIMUM_RECORDS)) {
    const sanitizedRecord = sanitizeRecord(record);
    if (!sanitizedRecord) {
      return undefined;
    }
    sanitizedRecords.push(sanitizedRecord);
  }

  return {
    schemaVersion: SCHEMA_VERSION,
    truncated:
      asBoolean(attachment["truncated"]) === true || sanitizedRecords.length < records.length,
    records: sanitizedRecords,
  };
}

function sanitizeRecord(value: unknown): BrowserLifecycleRecord | undefined {
  const record = asRecord(value);
  if (!record) {
    return undefined;
  }

  const method = sanitizeLifecycleMethod(record["method"]);
  const origin = sanitizeLifecycleOrigin(record["origin"]);
  const pathTemplate = sanitizeLifecyclePathTemplate(record["pathTemplate"]);
  const classification = sanitizeLifecycleClassification(record["classification"]);
  const requestStarted = sanitizeEvent(record["requestStarted"]);
  if (!method || !origin || !pathTemplate || !classification || !requestStarted) {
    return undefined;
  }

  const sanitized: BrowserLifecycleRecord = {
    method,
    origin,
    pathTemplate,
    requestStarted,
    classification,
  };
  copyEvent({ source: record, target: sanitized, field: "responseReceived" });
  copyEvent({ source: record, target: sanitized, field: "loadingFinished" });
  copyFailureEvent({ source: record, target: sanitized });
  copySafeIdentifier({ source: record, target: sanitized, field: "playwrightRequestKey" });
  copySafeIdentifier({ source: record, target: sanitized, field: "cdpRequestId" });
  copySafeIdentifier({ source: record, target: sanitized, field: "loaderId" });
  copySafeIdentifier({ source: record, target: sanitized, field: "apiGatewayRequestId" });
  copyTraceIdentifiers({ source: record, target: sanitized });
  copyConnection({ source: record, target: sanitized });
  copyEncodedBytes({ source: record, target: sanitized });

  const protocol = sanitizeLifecycleProtocol(record["protocol"]);
  if (protocol) {
    sanitized.protocol = protocol;
  }

  return sanitized;
}

function prioritizeRecords(records: readonly BrowserLifecycleRecord[]): BrowserLifecycleRecord[] {
  return CLIENT_LIFECYCLE_CLASSIFICATION_PRIORITY.flatMap((classification) =>
    records.filter((record) => record.classification === classification),
  );
}

interface SerializeAttachmentInput {
  records: BrowserLifecycleRecord[];
  truncated: boolean;
}

function serializeAttachment({
  records,
  truncated,
}: SerializeAttachmentInput): Pick<EncodedBrowserLifecycleAttachment, "attachment" | "body"> {
  const attachment: BrowserLifecycleAttachment = {
    schemaVersion: SCHEMA_VERSION,
    truncated,
    records,
  };
  return {
    attachment,
    body: Buffer.from(JSON.stringify(attachment)),
  };
}

interface CopyRecordFieldInput {
  source: Record<string, unknown>;
  target: BrowserLifecycleRecord;
}

interface CopyEventInput extends CopyRecordFieldInput {
  field: "responseReceived" | "loadingFinished";
}

function copyEvent({ source, target, field }: CopyEventInput): void {
  const event = sanitizeEvent(source[field]);
  if (event) {
    target[field] = event;
  }
}

function copyFailureEvent({ source, target }: CopyRecordFieldInput): void {
  const value = source["loadingFailed"];
  const sourceEvent = asRecord(value);
  if (!sourceEvent) {
    return;
  }

  const event: BrowserLifecycleFailureEvent = sanitizeEvent(value) ?? {};
  const errorText = sanitizeLifecycleNetworkError(sourceEvent["errorText"]);
  if (errorText) {
    event.errorText = errorText;
  }
  const canceled = asBoolean(sourceEvent["canceled"]);
  if (canceled !== undefined) {
    event.canceled = canceled;
  }
  copyFailureIdentifier({ source: sourceEvent, target: event, field: "blockedReason" });
  copyFailureIdentifier({ source: sourceEvent, target: event, field: "corsErrorStatus" });

  if (Object.keys(event).length > 0) {
    target.loadingFailed = event;
  }
}

function sanitizeEvent(value: unknown): BrowserLifecycleEvent | undefined {
  const source = asRecord(value);
  if (!source) {
    return undefined;
  }

  const cdp = sanitizeTimestamp(source["cdp"]);
  const playwright = sanitizeTimestamp(source["playwright"]);
  if (cdp) {
    return { cdp, ...(playwright && { playwright }) };
  }
  return playwright ? { playwright } : undefined;
}

function sanitizeTimestamp(value: unknown): BrowserLifecycleTimestamp | undefined {
  const timestamp = asRecord(value);
  const utc = asString(timestamp?.["utc"]);
  if (!utc) {
    return undefined;
  }
  const timestampMs = Date.parse(utc);
  if (!Number.isFinite(timestampMs)) {
    return undefined;
  }

  const sanitized: BrowserLifecycleTimestamp = {
    utc: new Date(timestampMs).toISOString(),
  };
  const monotonicMilliseconds = sanitizeLifecycleNonNegativeNumber(
    timestamp?.["monotonicMilliseconds"],
  );
  if (monotonicMilliseconds !== undefined) {
    sanitized.monotonicMilliseconds = monotonicMilliseconds;
  }
  return sanitized;
}

interface CopySafeIdentifierInput extends CopyRecordFieldInput {
  field: "playwrightRequestKey" | "cdpRequestId" | "loaderId" | "apiGatewayRequestId";
}

function copySafeIdentifier({ source, target, field }: CopySafeIdentifierInput): void {
  const value = sanitizeLifecycleIdentifier(source[field]);
  if (value) {
    target[field] = value;
  }
}

interface CopyFailureIdentifierInput {
  source: Record<string, unknown>;
  target: BrowserLifecycleFailureEvent;
  field: "blockedReason" | "corsErrorStatus";
}

function copyFailureIdentifier({ source, target, field }: CopyFailureIdentifierInput): void {
  const value = sanitizeLifecycleIdentifier(source[field]);
  if (value) {
    target[field] = value;
  }
}

function copyTraceIdentifiers({ source, target }: CopyRecordFieldInput): void {
  const traceId = sanitizeLifecycleTraceId(source["traceId"]);
  if (traceId) {
    target.traceId = traceId;
  }
  const spanId = sanitizeLifecycleSpanId(source["spanId"]);
  if (spanId) {
    target.spanId = spanId;
  }
}

function copyConnection({ source, target }: CopyRecordFieldInput): void {
  const connectionSource = asRecord(source["connection"]);
  if (!connectionSource) {
    return;
  }

  const connection: BrowserLifecycleConnection = {};
  const id = sanitizeLifecycleNonNegativeNumber(connectionSource["id"]);
  if (id !== undefined) {
    connection.id = id;
  }
  const reused = asBoolean(connectionSource["reused"]);
  if (reused !== undefined) {
    connection.reused = reused;
  }

  const endpointSource = asRecord(connectionSource["remoteEndpoint"]);
  if (endpointSource) {
    const remoteEndpoint: NonNullable<BrowserLifecycleConnection["remoteEndpoint"]> = {};
    const ipAddress = sanitizeLifecycleIpAddress(endpointSource["ipAddress"]);
    if (ipAddress) {
      remoteEndpoint.ipAddress = ipAddress;
    }
    const port = sanitizeLifecycleNonNegativeNumber(endpointSource["port"]);
    if (port !== undefined) {
      remoteEndpoint.port = port;
    }
    if (Object.keys(remoteEndpoint).length > 0) {
      connection.remoteEndpoint = remoteEndpoint;
    }
  }

  if (Object.keys(connection).length > 0) {
    target.connection = connection;
  }
}

function copyEncodedBytes({ source, target }: CopyRecordFieldInput): void {
  const bytesSource = asRecord(source["encodedBytes"]);
  if (!bytesSource) {
    return;
  }

  const encodedBytes: BrowserLifecycleEncodedBytes = {};
  for (const field of ["data", "responseHeaders", "total"] as const) {
    const value = sanitizeLifecycleNonNegativeNumber(bytesSource[field]);
    if (value !== undefined) {
      encodedBytes[field] = value;
    }
  }
  if (Object.keys(encodedBytes).length > 0) {
    target.encodedBytes = encodedBytes;
  }
}
