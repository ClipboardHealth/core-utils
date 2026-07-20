import { closeSync, openSync, readSync, statSync } from "node:fs";

import type { TestResult } from "@playwright/test/reporter";

import type {
  ClientLifecycle,
  ClientLifecycleClassification,
  NetworkInstance,
  NetworkReport,
} from "../types";
import {
  CLIENT_LIFECYCLE_ATTACHMENT_BYTES_CAP,
  CLIENT_LIFECYCLE_IDENTIFIER_CAP,
  CLIENT_LIFECYCLE_PATH_CAP,
  CLIENT_LIFECYCLE_RECORDS_CAP,
} from "./constants";
import { stripAnsi } from "./textProcessing";
import { asBoolean, asNumber, asRecord, asString } from "./typeGuards";

const ATTACHMENT_NAMES = new Set(["browser-network-lifecycle", "browser-network-lifecycle.json"]);
const CLASSIFICATIONS: Record<ClientLifecycleClassification, true> = {
  no_response_headers: true,
  headers_without_body_completion: true,
  network_failure: true,
  completed: true,
};
const SAFE_IDENTIFIER_PATTERN = /^[A-Za-z0-9_:=./+-]+$/;
const SAFE_PROTOCOL_PATTERN = /^[A-Za-z0-9./_-]+$/;
const SAFE_NETWORK_ERROR_PATTERN = /^net::[A-Z0-9_]+$/;
const SAFE_IP_ADDRESS_PATTERN = /^[A-Fa-f0-9:.]+$/;

interface ParsedClientLifecycle {
  lifecycle: ClientLifecycle;
  requestOffsetMs?: number;
}

interface AttachClientLifecyclesInput {
  attachments: TestResult["attachments"];
  network: NetworkReport;
  attemptStartTimeMs: number;
}

export function attachClientLifecycles({
  attachments,
  network,
  attemptStartTimeMs,
}: AttachClientLifecyclesInput): void {
  const parsedRecords: ParsedClientLifecycle[] = [];
  let truncated = false;

  for (const attachment of attachments) {
    if (!ATTACHMENT_NAMES.has(attachment.name.toLowerCase())) {
      continue;
    }

    const attachmentContent = readBoundedAttachment(attachment);
    if (!attachmentContent) {
      continue;
    }

    const parsedAttachment = parseAttachment({
      content: attachmentContent,
      attemptStartTimeMs,
    });
    if (!parsedAttachment) {
      continue;
    }

    truncated ||= parsedAttachment.truncated;
    for (const record of parsedAttachment.records) {
      if (parsedRecords.length >= CLIENT_LIFECYCLE_RECORDS_CAP) {
        truncated = true;
        break;
      }
      parsedRecords.push(record);
    }
  }

  if (truncated) {
    for (const record of parsedRecords) {
      record.lifecycle.truncated = true;
    }
  }

  joinClientLifecycles({ network, records: parsedRecords });
}

interface ParsedAttachment {
  records: ParsedClientLifecycle[];
  truncated: boolean;
}

interface ParseAttachmentInput {
  content: Uint8Array;
  attemptStartTimeMs: number;
}

function parseAttachment({
  content,
  attemptStartTimeMs,
}: ParseAttachmentInput): ParsedAttachment | undefined {
  let parsedValue: unknown;
  try {
    parsedValue = JSON.parse(Buffer.from(content).toString("utf8"));
  } catch {
    return undefined;
  }

  const attachmentRecord = asRecord(parsedValue);
  if (!attachmentRecord) {
    return undefined;
  }
  const schemaVersion = asNumber(attachmentRecord["schemaVersion"]);
  const lifecycleRecords = attachmentRecord["records"];
  if (schemaVersion !== 1 || !Array.isArray(lifecycleRecords)) {
    return undefined;
  }

  const records: ParsedClientLifecycle[] = [];
  for (const recordValue of lifecycleRecords.slice(0, CLIENT_LIFECYCLE_RECORDS_CAP)) {
    const parsedRecord = parseLifecycleRecord({
      value: recordValue,
      attemptStartTimeMs,
    });
    if (parsedRecord) {
      records.push(parsedRecord);
    }
  }

  return {
    records,
    truncated:
      asBoolean(attachmentRecord["truncated"]) === true ||
      lifecycleRecords.length > CLIENT_LIFECYCLE_RECORDS_CAP,
  };
}

function readBoundedAttachment(
  attachment: TestResult["attachments"][number],
): Uint8Array | undefined {
  if (attachment.body) {
    if (attachment.body.length > CLIENT_LIFECYCLE_ATTACHMENT_BYTES_CAP) {
      return undefined;
    }
    return attachment.body;
  }

  if (!attachment.path) {
    return undefined;
  }

  try {
    // eslint-disable-next-line security/detect-non-literal-fs-filename
    const attachmentSize = statSync(attachment.path).size;
    if (attachmentSize > CLIENT_LIFECYCLE_ATTACHMENT_BYTES_CAP) {
      return undefined;
    }

    const content = Buffer.alloc(attachmentSize);
    // eslint-disable-next-line security/detect-non-literal-fs-filename
    const fileDescriptor = openSync(attachment.path, "r");
    try {
      const bytesRead = readSync(fileDescriptor, content, 0, attachmentSize, 0);
      return content.subarray(0, bytesRead);
    } finally {
      closeSync(fileDescriptor);
    }
  } catch {
    return undefined;
  }
}

interface ParseLifecycleRecordInput {
  value: unknown;
  attemptStartTimeMs: number;
}

interface CopyFieldInput {
  source: Record<string, unknown>;
  target: ClientLifecycle;
}

function parseLifecycleRecord({
  value,
  attemptStartTimeMs,
}: ParseLifecycleRecordInput): ParsedClientLifecycle | undefined {
  const record = asRecord(value);
  if (!record) {
    return undefined;
  }

  const method = sanitizeMethod(record["method"]);
  const origin = sanitizeOrigin(record["origin"]);
  const pathTemplate = sanitizePathTemplate(record["pathTemplate"]);
  if (!method || !origin || !pathTemplate) {
    return undefined;
  }

  const lifecycle: ClientLifecycle = { method, origin, pathTemplate };
  copyLifecycleEventFields({ source: record, target: lifecycle });
  copyLifecycleConnectionFields({ source: record, target: lifecycle });
  copyLifecycleCorrelationFields({ source: record, target: lifecycle });
  copyLifecycleFailureFields({ source: record, target: lifecycle });

  const classification = asString(record["classification"]);
  if (classification && isClientLifecycleClassification(classification)) {
    lifecycle.classification = classification;
  }

  const requestStartedAt = lifecycle.requestStartedAt;
  return {
    lifecycle,
    ...(requestStartedAt !== undefined && {
      requestOffsetMs: Date.parse(requestStartedAt) - attemptStartTimeMs,
    }),
  };
}

function copyLifecycleEventFields({ source, target }: CopyFieldInput): void {
  copyTimestamp({ source, target, field: "requestStartedAt" });
  copyTimestamp({ source, target, field: "responseHeadersAt" });
  copyTimestamp({ source, target, field: "completedAt" });
  copyTimestamp({ source, target, field: "failedAt" });

  copyNonNegativeNumber({
    source,
    target,
    field: "requestStartedMonotonicMs",
  });
  copyNonNegativeNumber({
    source,
    target,
    field: "responseHeadersMonotonicMs",
  });
  copyNonNegativeNumber({ source, target, field: "completedMonotonicMs" });
  copyNonNegativeNumber({ source, target, field: "failedMonotonicMs" });

  copyBoolean({ source, target, field: "requestStarted" });
  copyBoolean({ source, target, field: "responseHeadersReceived" });
  copyBoolean({ source, target, field: "loadingFinished" });
  copyBoolean({ source, target, field: "loadingFailed" });
  copyBoolean({ source, target, field: "pendingAtTimeout" });
}

function copyLifecycleConnectionFields({ source, target }: CopyFieldInput): void {
  copyNonNegativeNumber({ source, target, field: "connectionId" });
  copyNonNegativeNumber({ source, target, field: "remotePort" });
  copyNonNegativeNumber({
    source,
    target,
    field: "responseEncodedDataLength",
  });
  copyNonNegativeNumber({
    source,
    target,
    field: "completedEncodedDataLength",
  });
  copyBoolean({ source, target, field: "connectionReused" });

  const protocol = asString(source["protocol"]);
  if (
    protocol &&
    protocol.length <= CLIENT_LIFECYCLE_IDENTIFIER_CAP &&
    SAFE_PROTOCOL_PATTERN.test(protocol)
  ) {
    target.protocol = protocol;
  }
  const remoteIPAddress = asString(source["remoteIPAddress"]);
  if (
    remoteIPAddress &&
    remoteIPAddress.length <= CLIENT_LIFECYCLE_IDENTIFIER_CAP &&
    SAFE_IP_ADDRESS_PATTERN.test(remoteIPAddress)
  ) {
    target.remoteIPAddress = remoteIPAddress;
  }
}

function copyLifecycleCorrelationFields({ source, target }: CopyFieldInput): void {
  copySafeIdentifier({ source, target, field: "playwrightRequestKey" });
  copySafeIdentifier({ source, target, field: "cdpRequestId" });
  copySafeIdentifier({ source, target, field: "loaderId" });
  copySafeIdentifier({ source, target, field: "apiGatewayRequestId" });

  const traceId = asString(source["traceId"])?.toLowerCase();
  if (traceId && /^[a-f0-9]{32}$/.test(traceId) && !/^0+$/.test(traceId)) {
    target.traceId = traceId;
  }
  const spanId = asString(source["spanId"])?.toLowerCase();
  if (spanId && /^[a-f0-9]{16}$/.test(spanId) && !/^0+$/.test(spanId)) {
    target.spanId = spanId;
  }
}

function copyLifecycleFailureFields({ source, target }: CopyFieldInput): void {
  copyBoolean({ source, target, field: "canceled" });
  copySafeIdentifier({ source, target, field: "blockedReason" });
  copySafeIdentifier({ source, target, field: "corsErrorStatus" });

  const errorText = asString(source["errorText"]);
  if (!errorText) {
    return;
  }
  const sanitizedErrorText = stripAnsi(errorText).trim();
  if (SAFE_NETWORK_ERROR_PATTERN.test(sanitizedErrorText)) {
    target.errorText = sanitizedErrorText;
  }
}

function isClientLifecycleClassification(value: string): value is ClientLifecycleClassification {
  return Object.hasOwn(CLASSIFICATIONS, value);
}

interface CopyTimestampInput extends CopyFieldInput {
  field: "requestStartedAt" | "responseHeadersAt" | "completedAt" | "failedAt";
}

function copyTimestamp({ source, target, field }: CopyTimestampInput): void {
  const value = asString(source[field]);
  if (!value) {
    return;
  }
  const timestampMs = Date.parse(value);
  if (!Number.isFinite(timestampMs)) {
    return;
  }
  target[field] = new Date(timestampMs).toISOString();
}

interface CopyNonNegativeNumberInput extends CopyFieldInput {
  field:
    | "requestStartedMonotonicMs"
    | "responseHeadersMonotonicMs"
    | "completedMonotonicMs"
    | "failedMonotonicMs"
    | "connectionId"
    | "remotePort"
    | "responseEncodedDataLength"
    | "completedEncodedDataLength";
}

function copyNonNegativeNumber({ source, target, field }: CopyNonNegativeNumberInput): void {
  const value = asNumber(source[field]);
  if (value === undefined || value < 0 || value > Number.MAX_SAFE_INTEGER) {
    return;
  }
  target[field] = value;
}

interface CopyBooleanInput extends CopyFieldInput {
  field:
    | "requestStarted"
    | "responseHeadersReceived"
    | "loadingFinished"
    | "loadingFailed"
    | "pendingAtTimeout"
    | "connectionReused"
    | "canceled";
}

function copyBoolean({ source, target, field }: CopyBooleanInput): void {
  const value = asBoolean(source[field]);
  if (value !== undefined) {
    target[field] = value;
  }
}

interface CopySafeIdentifierInput extends CopyFieldInput {
  field:
    | "playwrightRequestKey"
    | "cdpRequestId"
    | "loaderId"
    | "apiGatewayRequestId"
    | "blockedReason"
    | "corsErrorStatus";
}

function copySafeIdentifier({ source, target, field }: CopySafeIdentifierInput): void {
  const value = asString(source[field]);
  if (
    value &&
    value.length <= CLIENT_LIFECYCLE_IDENTIFIER_CAP &&
    SAFE_IDENTIFIER_PATTERN.test(value)
  ) {
    target[field] = value;
  }
}

function sanitizeMethod(value: unknown): string | undefined {
  const method = asString(value)?.trim().toUpperCase();
  if (!method || method.length > 16 || !/^[A-Z]+$/.test(method)) {
    return undefined;
  }
  return method;
}

function sanitizeOrigin(value: unknown): string | undefined {
  const originText = asString(value);
  if (!originText || originText.length > CLIENT_LIFECYCLE_IDENTIFIER_CAP) {
    return undefined;
  }
  try {
    const url = new URL(originText);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return undefined;
    }
    return url.origin;
  } catch {
    return undefined;
  }
}

function sanitizePathTemplate(value: unknown): string | undefined {
  const pathText = asString(value);
  if (!pathText) {
    return undefined;
  }
  const [withoutQuery] = pathText.split(/[?#]/, 1);
  if (
    !withoutQuery ||
    !withoutQuery.startsWith("/") ||
    withoutQuery.length > CLIENT_LIFECYCLE_PATH_CAP
  ) {
    return undefined;
  }
  return withoutQuery;
}

interface JoinClientLifecyclesInput {
  network: NetworkReport;
  records: ParsedClientLifecycle[];
}

function joinClientLifecycles({ network, records }: JoinClientLifecyclesInput): void {
  const candidatesByMethodAndOrigin = buildJoinCandidateIndex(network.instances);
  const matchedInstanceIds = new Set<string>();
  for (const record of records) {
    const lifecycle = record.lifecycle;
    const joinKey = buildJoinKey({ method: lifecycle.method, origin: lifecycle.origin });
    const pathTemplateSegments = lifecycle.pathTemplate.split("/");
    const candidates = (candidatesByMethodAndOrigin.get(joinKey) ?? [])
      .filter(
        (candidate) =>
          !matchedInstanceIds.has(candidate.instance.id) &&
          matchesPathTemplate({
            pathTemplateSegments,
            pathnameSegments: candidate.pathnameSegments,
          }),
      )
      .map((candidate) => candidate.instance);
    const matchingInstance = pickClosestInstance({
      candidates,
      ...(record.requestOffsetMs !== undefined && { requestOffsetMs: record.requestOffsetMs }),
    });
    if (!matchingInstance) {
      continue;
    }

    matchingInstance.clientLifecycle = lifecycle;
    matchedInstanceIds.add(matchingInstance.id);
  }
}

interface JoinCandidate {
  instance: NetworkInstance;
  pathnameSegments: string[];
}

function buildJoinCandidateIndex(instances: NetworkInstance[]): Map<string, JoinCandidate[]> {
  const candidatesByMethodAndOrigin = new Map<string, JoinCandidate[]>();
  for (const instance of instances) {
    let instanceUrl: URL;
    try {
      instanceUrl = new URL(instance.url);
    } catch {
      continue;
    }

    const joinKey = buildJoinKey({
      method: instance.method.toUpperCase(),
      origin: instanceUrl.origin,
    });
    const candidate: JoinCandidate = {
      instance,
      pathnameSegments: instanceUrl.pathname.split("/"),
    };
    const candidates = candidatesByMethodAndOrigin.get(joinKey);
    if (candidates) {
      candidates.push(candidate);
    } else {
      candidatesByMethodAndOrigin.set(joinKey, [candidate]);
    }
  }
  return candidatesByMethodAndOrigin;
}

interface BuildJoinKeyInput {
  method: string;
  origin: string;
}

function buildJoinKey({ method, origin }: BuildJoinKeyInput): string {
  return JSON.stringify([method, origin]);
}

interface MatchesPathTemplateInput {
  pathTemplateSegments: string[];
  pathnameSegments: string[];
}

function matchesPathTemplate({
  pathTemplateSegments,
  pathnameSegments,
}: MatchesPathTemplateInput): boolean {
  if (pathTemplateSegments.length !== pathnameSegments.length) {
    return false;
  }

  return pathTemplateSegments.every((templateSegment, index) => {
    const pathSegment = pathnameSegments[index];
    if (
      templateSegment.startsWith(":") ||
      (templateSegment.startsWith("{") && templateSegment.endsWith("}"))
    ) {
      return Boolean(pathSegment);
    }
    return templateSegment === pathSegment;
  });
}

interface PickClosestInstanceInput {
  candidates: NetworkInstance[];
  requestOffsetMs?: number;
}

function pickClosestInstance({
  candidates,
  requestOffsetMs,
}: PickClosestInstanceInput): NetworkInstance | undefined {
  if (requestOffsetMs === undefined) {
    return candidates[0];
  }

  let closest: NetworkInstance | undefined;
  for (const candidate of candidates) {
    if (candidate.offsetMs === undefined) {
      closest ??= candidate;
      continue;
    }
    if (closest?.offsetMs === undefined) {
      closest = candidate;
      continue;
    }

    const closestDistance = Math.abs(closest.offsetMs - requestOffsetMs);
    const candidateDistance = Math.abs(candidate.offsetMs - requestOffsetMs);
    if (candidateDistance < closestDistance) {
      closest = candidate;
    }
  }
  return closest;
}
