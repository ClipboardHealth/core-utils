import type { NetworkRequest, NetworkTimingBreakdown } from "../types";
import { HEADER_VALUE_CAP, REQUEST_HEADER_ALLOWLIST, RESPONSE_HEADER_ALLOWLIST } from "./constants";
import { capNetworkBody, capText, isJsonOrTextContentType, stripAnsi } from "./textProcessing";
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

const INVALID_TRACE_ID = "00000000000000000000000000000000";
const INVALID_SPAN_ID = "0000000000000000";
const TRACEPARENT_PATTERN = /^([0-9a-f]{2})-([0-9a-f]{32})-([0-9a-f]{16})-([0-9a-f]{2})$/;

function parseTraceparent(
  header: string | undefined,
): { traceId: string; spanId: string } | undefined {
  if (!header) {
    return undefined;
  }
  const match = TRACEPARENT_PATTERN.exec(header.trim().toLowerCase());
  if (!match) {
    return undefined;
  }
  const [, version, traceId, spanId] = match;
  if (version === "ff" || traceId === INVALID_TRACE_ID || spanId === INVALID_SPAN_ID) {
    return undefined;
  }
  return { traceId: traceId!, spanId: spanId! };
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
): string | undefined {
  if (!traceBodyRecord) {
    return undefined;
  }

  const mimeType = asString(traceBodyRecord["mimeType"]);
  if (!isJsonOrTextContentType(mimeType)) {
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

  const body = Buffer.from(resourceContent).toString("utf8");
  return capNetworkBody(body);
}

function enrichNetworkRequest(params: {
  networkRequest: NetworkRequest;
  snapshotRecord: Record<string, unknown>;
  requestRecord: Record<string, unknown>;
  responseRecord: Record<string, unknown>;
  archiveEntries: Record<string, Uint8Array>;
  anchor: MonotonicAnchor | undefined;
  attemptStartTimeMs: number;
}): void {
  const {
    networkRequest,
    snapshotRecord,
    requestRecord,
    responseRecord,
    archiveEntries,
    anchor,
    attemptStartTimeMs,
  } = params;
  const resourceType = asString(snapshotRecord["_resourceType"]);
  if (resourceType) {
    networkRequest.resourceType = resourceType;
  }

  const timings = extractNetworkTimings(snapshotRecord);
  if (timings) {
    networkRequest.timings = timings;
  }

  const durationMs = deriveNetworkDurationMs(timings);
  if (durationMs !== undefined) {
    networkRequest.durationMs = durationMs;
  }

  const failureText = asString(responseRecord["_failureText"]);
  if (failureText) {
    networkRequest.failureText = capNetworkBody(stripAnsi(failureText));
  }

  const wasAborted = asBoolean(snapshotRecord["_wasAborted"]);
  if (wasAborted !== undefined) {
    networkRequest.wasAborted = wasAborted;
  }

  const redirectToUrl = asString(responseRecord["redirectURL"]);
  if (redirectToUrl) {
    networkRequest.redirectToUrl = redirectToUrl;
  }

  const networkOffsetMs = computeNetworkOffsetMs(snapshotRecord, anchor, attemptStartTimeMs);
  if (networkOffsetMs !== undefined) {
    networkRequest.offsetMs = networkOffsetMs;
  }

  const requestHeaders = extractAllowlistedHeaders(
    requestRecord["headers"],
    REQUEST_HEADER_ALLOWLIST,
  );
  if (requestHeaders) {
    networkRequest.requestHeaders = requestHeaders;
  }

  const responseHeaders = extractAllowlistedHeaders(
    responseRecord["headers"],
    RESPONSE_HEADER_ALLOWLIST,
  );
  if (responseHeaders) {
    networkRequest.responseHeaders = responseHeaders;
  }

  const traceContext = extractTraceContext(requestHeaders, responseHeaders);
  if (traceContext) {
    networkRequest.traceId = traceContext.traceId;
    networkRequest.spanId = traceContext.spanId;
  }

  const requestBody = readTraceResourceBody(archiveEntries, asRecord(requestRecord["postData"]));
  if (requestBody !== undefined) {
    networkRequest.requestBody = requestBody;
  }

  const responseBody = readTraceResourceBody(archiveEntries, asRecord(responseRecord["content"]));
  if (responseBody !== undefined) {
    networkRequest.responseBody = responseBody;
  }
}

export function buildNetworkRequestFromEvent(
  eventRecord: Record<string, unknown>,
  archiveEntries: Record<string, Uint8Array>,
  anchor: MonotonicAnchor | undefined,
  attemptStartTimeMs: number,
): NetworkRequest | undefined {
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

  const networkRequest: NetworkRequest = {
    method,
    url,
    status,
  };

  enrichNetworkRequest({
    networkRequest,
    snapshotRecord,
    requestRecord,
    responseRecord,
    archiveEntries,
    anchor,
    attemptStartTimeMs,
  });

  return networkRequest;
}

export function annotateRedirectChains(networkRequests: NetworkRequest[]): void {
  for (const [index, request] of networkRequests.entries()) {
    if (!request.redirectToUrl) {
      continue;
    }

    const redirectChain = [{ url: request.url, status: request.status }];
    const visitedRequestIndexes = new Set([index]);
    let previousRequest = request;
    let currentIndex = index;
    let nextUrl: string | undefined = request.redirectToUrl;

    while (nextUrl) {
      let nextIndex = -1;
      for (
        let candidateIndex = currentIndex + 1;
        candidateIndex < networkRequests.length;
        candidateIndex++
      ) {
        if (visitedRequestIndexes.has(candidateIndex)) {
          continue;
        }

        const candidateRequest = networkRequests[candidateIndex];
        if (candidateRequest?.url !== nextUrl) {
          continue;
        }

        nextIndex = candidateIndex;
        break;
      }

      if (nextIndex < 0) {
        break;
      }

      const nextRequest = networkRequests[nextIndex];
      if (!nextRequest) {
        break;
      }

      nextRequest.redirectFromUrl ??= previousRequest.url;
      redirectChain.push({ url: nextRequest.url, status: nextRequest.status });
      visitedRequestIndexes.add(nextIndex);
      previousRequest = nextRequest;
      currentIndex = nextIndex;
      nextUrl = nextRequest.redirectToUrl;
    }

    if (redirectChain.length > 1) {
      request.redirectChain = redirectChain;
    }
  }
}
