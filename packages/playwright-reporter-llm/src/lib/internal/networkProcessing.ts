import type { NetworkTimingBreakdown } from "../types";
import { HEADER_VALUE_CAP, REQUEST_HEADER_ALLOWLIST, RESPONSE_HEADER_ALLOWLIST } from "./constants";
import {
  hashBody,
  type NetworkObservation,
  type NetworkObservationBody,
  type NetworkObservationInstance,
  type NetworkObservationShape,
} from "./networkBuilder";
import { capNetworkBody, capText, isJsonOrTextContentType, stripAnsi } from "./textProcessing";
import { parseTraceparent } from "./traceparent";
import { computeNetworkOffsetMs, type MonotonicAnchor } from "./traceTiming";
import { asBoolean, asNumber, asRecord, asString } from "./typeGuards";

function extractAllowlistedHeaders(
  headersValue: unknown,
  allowlist: ReadonlySet<string>,
): Record<string, string> | undefined {
  if (!Array.isArray(headersValue)) {
    return undefined;
  }

  const headers: Record<string, string> = {};
  for (const headerValue of headersValue) {
    const headerRecord = asRecord(headerValue);
    const headerName = asString(headerRecord?.["name"])?.trim().toLowerCase();
    if (!headerName || !allowlist.has(headerName)) {
      continue;
    }

    const headerText = asString(headerRecord?.["value"]);
    if (!headerText) {
      continue;
    }
    headers[headerName] = capText(stripAnsi(headerText), HEADER_VALUE_CAP);
  }

  if (Object.keys(headers).length === 0) {
    return undefined;
  }
  return headers;
}

function extractNetworkTimings(
  snapshotRecord: Record<string, unknown>,
): NetworkTimingBreakdown | undefined {
  const timingsRecord = asRecord(snapshotRecord["timings"]);
  if (!timingsRecord) {
    return undefined;
  }

  const timings: NetworkTimingBreakdown = {};
  const sendMs = asNumber(timingsRecord["send"]);
  if (sendMs !== undefined && sendMs >= 0) {
    timings.sendMs = sendMs;
  }
  const waitMs = asNumber(timingsRecord["wait"]);
  if (waitMs !== undefined && waitMs >= 0) {
    timings.waitMs = waitMs;
  }
  const receiveMs = asNumber(timingsRecord["receive"]);
  if (receiveMs !== undefined && receiveMs >= 0) {
    timings.receiveMs = receiveMs;
  }
  const dnsMs = asNumber(timingsRecord["dns"]);
  if (dnsMs !== undefined && dnsMs >= 0) {
    timings.dnsMs = dnsMs;
  }
  const connectMs = asNumber(timingsRecord["connect"]);
  if (connectMs !== undefined && connectMs >= 0) {
    timings.connectMs = connectMs;
  }
  const sslMs = asNumber(timingsRecord["ssl"]);
  if (sslMs !== undefined && sslMs >= 0) {
    timings.sslMs = sslMs;
  }

  if (Object.keys(timings).length === 0) {
    return undefined;
  }
  return timings;
}

function deriveNetworkDurationMs(timings: NetworkTimingBreakdown | undefined): number | undefined {
  if (!timings) {
    return undefined;
  }

  const timingValues = [
    timings.sendMs,
    timings.waitMs,
    timings.receiveMs,
    timings.dnsMs,
    timings.connectMs,
  ];
  let totalDurationMs = 0;
  let hasDurationValue = false;

  for (const value of timingValues) {
    if (value === undefined) {
      continue;
    }
    totalDurationMs += value;
    hasDurationValue = true;
  }

  if (!hasDurationValue) {
    return undefined;
  }
  return totalDurationMs;
}

function extractTraceContext(
  requestHeaders: Record<string, string> | undefined,
  responseHeaders: Record<string, string> | undefined,
): { traceId: string; spanId: string } | undefined {
  return (
    parseTraceparent(responseHeaders?.["traceparent"]) ??
    parseTraceparent(requestHeaders?.["traceparent"])
  );
}

function readTraceResourceBody(
  archiveEntries: Record<string, Uint8Array>,
  traceBodyRecord: Record<string, unknown> | undefined,
): NetworkObservationBody | undefined {
  if (!traceBodyRecord) {
    return undefined;
  }

  const contentType = asString(traceBodyRecord["mimeType"]);
  if (!isJsonOrTextContentType(contentType)) {
    return undefined;
  }

  const resourceSha = asString(traceBodyRecord["_sha1"]);
  if (!resourceSha) {
    return undefined;
  }

  const resourcePath = `resources/${resourceSha}`;
  const resourceContent = archiveEntries[resourcePath];
  if (!resourceContent) {
    return undefined;
  }

  const rawContent = Buffer.from(resourceContent).toString("utf8");
  const cappedContent = capNetworkBody(rawContent);
  const truncated = cappedContent !== rawContent;

  const body: NetworkObservationBody = {
    content: cappedContent,
    truncated,
    fingerprint: hashBody(cappedContent),
  };
  if (contentType !== undefined) {
    body.contentType = contentType;
  }
  return body;
}

const URL_EXTENSION_RESOURCE_TYPES: readonly (readonly [RegExp, string])[] = [
  [/\.(js|mjs|cjs)(?:$|\?|#)/i, "script"],
  [/\.css(?:$|\?|#)/i, "stylesheet"],
  [/\.(png|jpe?g|gif|webp|svg|ico|bmp)(?:$|\?|#)/i, "image"],
  [/\.(woff2?|ttf|otf|eot)(?:$|\?|#)/i, "font"],
  [/\.(mp4|webm|ogg|mp3|wav)(?:$|\?|#)/i, "media"],
];

function inferResourceTypeFromContentType(contentType: string | undefined): string | undefined {
  if (!contentType) {
    return undefined;
  }
  const normalized = contentType.split(";")[0]?.trim().toLowerCase();
  if (!normalized) {
    return undefined;
  }
  if (normalized.startsWith("image/")) {
    return "image";
  }
  if (normalized.startsWith("font/") || normalized.includes("font")) {
    return "font";
  }
  if (normalized.startsWith("video/") || normalized.startsWith("audio/")) {
    return "media";
  }
  if (normalized === "text/css") {
    return "stylesheet";
  }
  if (normalized === "text/javascript" || normalized.includes("javascript")) {
    return "script";
  }
  if (normalized === "text/html") {
    return "document";
  }
  return undefined;
}

function inferResourceTypeFromUrl(url: string): string | undefined {
  for (const [pattern, type] of URL_EXTENSION_RESOURCE_TYPES) {
    if (pattern.test(url)) {
      return type;
    }
  }
  return undefined;
}

interface InferResourceTypeInput {
  declaredResourceType?: string;
  url: string;
  responseContentType?: string;
}

export function inferResourceType(input: InferResourceTypeInput): string | undefined {
  if (input.declaredResourceType) {
    return input.declaredResourceType;
  }
  return (
    inferResourceTypeFromContentType(input.responseContentType) ??
    inferResourceTypeFromUrl(input.url)
  );
}

interface BuildNetworkObservationInput {
  eventRecord: Record<string, unknown>;
  archiveEntries: Record<string, Uint8Array>;
  anchor: MonotonicAnchor | undefined;
  attemptStartTimeMs: number;
}

function buildShape(params: {
  method: string;
  url: string;
  status: number;
  snapshotRecord: Record<string, unknown>;
  responseRecord: Record<string, unknown>;
  responseContentType: string | undefined;
}): NetworkObservationShape {
  const { method, url, status, snapshotRecord, responseRecord, responseContentType } = params;
  const declaredResourceType = asString(snapshotRecord["_resourceType"]);
  const resourceType = inferResourceType({
    url,
    ...(declaredResourceType !== undefined && { declaredResourceType }),
    ...(responseContentType !== undefined && { responseContentType }),
  });

  const failureTextRaw = asString(responseRecord["_failureText"]);
  const failureText = failureTextRaw ? capNetworkBody(stripAnsi(failureTextRaw)) : undefined;
  const wasAborted = asBoolean(snapshotRecord["_wasAborted"]);

  const shape: NetworkObservationShape = { method, url, status };
  if (resourceType !== undefined) {
    shape.resourceType = resourceType;
  }
  if (failureText !== undefined) {
    shape.failureText = failureText;
  }
  if (wasAborted !== undefined) {
    shape.wasAborted = wasAborted;
  }
  return shape;
}

function buildInstance(params: {
  snapshotRecord: Record<string, unknown>;
  responseRecord: Record<string, unknown>;
  requestHeaders: Record<string, string> | undefined;
  responseHeaders: Record<string, string> | undefined;
  anchor: MonotonicAnchor | undefined;
  attemptStartTimeMs: number;
}): NetworkObservationInstance {
  const {
    snapshotRecord,
    responseRecord,
    requestHeaders,
    responseHeaders,
    anchor,
    attemptStartTimeMs,
  } = params;

  const instance: NetworkObservationInstance = {};
  const timings = extractNetworkTimings(snapshotRecord);
  if (timings) {
    instance.timings = timings;
  }
  const durationMs = deriveNetworkDurationMs(timings);
  if (durationMs !== undefined) {
    instance.durationMs = durationMs;
  }
  const networkOffsetMs = computeNetworkOffsetMs(snapshotRecord, anchor, attemptStartTimeMs);
  if (networkOffsetMs !== undefined) {
    instance.offsetMs = networkOffsetMs;
  }
  const traceContext = extractTraceContext(requestHeaders, responseHeaders);
  if (traceContext) {
    instance.traceId = traceContext.traceId;
    instance.spanId = traceContext.spanId;
  }
  const requestId = requestHeaders?.["x-request-id"] ?? responseHeaders?.["x-request-id"];
  if (requestId !== undefined) {
    instance.requestId = requestId;
  }
  const correlationId =
    requestHeaders?.["x-correlation-id"] ?? responseHeaders?.["x-correlation-id"];
  if (correlationId !== undefined) {
    instance.correlationId = correlationId;
  }
  const redirectToUrl = asString(responseRecord["redirectURL"]);
  if (redirectToUrl) {
    instance.redirectToUrl = redirectToUrl;
  }
  return instance;
}

export function buildNetworkObservationFromEvent(
  input: BuildNetworkObservationInput,
): NetworkObservation | undefined {
  const { eventRecord, archiveEntries, anchor, attemptStartTimeMs } = input;
  if (eventRecord["type"] !== "resource-snapshot") {
    return undefined;
  }

  const snapshotRecord = asRecord(eventRecord["snapshot"]);
  const requestRecord = asRecord(snapshotRecord?.["request"]);
  const responseRecord = asRecord(snapshotRecord?.["response"]);
  if (!snapshotRecord || !requestRecord || !responseRecord) {
    return undefined;
  }

  const method = asString(requestRecord["method"]);
  const url = asString(requestRecord["url"]);
  const status = asNumber(responseRecord["status"]);
  if (!method || !url || status === undefined) {
    return undefined;
  }

  const requestHeaders = extractAllowlistedHeaders(
    requestRecord["headers"],
    REQUEST_HEADER_ALLOWLIST,
  );
  const responseHeaders = extractAllowlistedHeaders(
    responseRecord["headers"],
    RESPONSE_HEADER_ALLOWLIST,
  );
  const responseContentType = responseHeaders?.["content-type"];

  const shape = buildShape({
    method,
    url,
    status,
    snapshotRecord,
    responseRecord,
    responseContentType,
  });

  const instance = buildInstance({
    snapshotRecord,
    responseRecord,
    requestHeaders,
    responseHeaders,
    anchor,
    attemptStartTimeMs,
  });

  const requestBody = readTraceResourceBody(archiveEntries, asRecord(requestRecord["postData"]));
  const responseBody = readTraceResourceBody(archiveEntries, asRecord(responseRecord["content"]));

  const observation: NetworkObservation = { shape, instance };
  if (requestBody) {
    observation.requestBody = requestBody;
  }
  if (responseBody) {
    observation.responseBody = responseBody;
  }
  return observation;
}
