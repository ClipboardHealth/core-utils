import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { inflateRawSync } from "node:zlib";

import type {
  FullConfig,
  FullResult,
  Reporter,
  Suite,
  TestCase,
  TestError as PlaywrightTestError,
  TestResult,
  TestStep,
} from "@playwright/test/reporter";

import type {
  AttemptResult,
  ConsoleEntry,
  FailureArtifacts,
  FlatStep,
  GlobalError,
  LlmReporterOptions,
  LlmTestEntry,
  LlmTestReport,
  NetworkRequest,
  NetworkTimingBreakdown,
  TestAttachment,
  TestError,
  TestStatus,
  TestSummary,
  TimelineConsoleEntry,
  TimelineEntry,
  TimelineNetworkEntry,
  TimelineStepEntry,
} from "./types";

const STDOUT_CAP = 4096;
const NETWORK_BODY_CAP = 2048;
const CONSOLE_TEXT_CAP = 2048;
const CONSOLE_MESSAGES_CAP = 50;
const NETWORK_REQUESTS_CAP = 200;
const HEADER_VALUE_CAP = 256;
const TRUNCATION_MARKER = "[truncated]";
const ZIP_END_OF_CENTRAL_DIRECTORY_SIGNATURE = 101_010_256;
const ZIP_CENTRAL_DIRECTORY_FILE_HEADER_SIGNATURE = 33_639_248;
const ZIP_LOCAL_FILE_HEADER_SIGNATURE = 67_324_752;
const ZIP_COMPRESSION_STORED = 0;
const ZIP_COMPRESSION_DEFLATE = 8;
const REQUEST_HEADER_ALLOWLIST = new Set([
  "content-type",
  "x-request-id",
  "x-correlation-id",
  "x-datadog-trace-id",
  "x-datadog-parent-id",
  "x-datadog-span-id",
]);
const RESPONSE_HEADER_ALLOWLIST = new Set([
  "content-type",
  "location",
  "x-request-id",
  "x-correlation-id",
  "x-datadog-trace-id",
  "x-datadog-parent-id",
  "x-datadog-span-id",
]);
const HIGH_SIGNAL_CONSOLE_ENTRY_TYPES = new Set(["warning", "error", "pageerror"]);
const HIGH_SIGNAL_RESOURCE_TYPES = new Set(["fetch", "xhr"]);
const SCREENSHOT_BASE64_CAP = 524_288;

function stripAnsi(text: string): string {
  // eslint-disable-next-line no-control-regex
  return text.replaceAll(/\u001B\[[0-9;]*m/g, "");
}

function capOutput(text: string): string {
  if (text.length <= STDOUT_CAP) {
    return text;
  }
  return `${text.slice(0, STDOUT_CAP - TRUNCATION_MARKER.length)}${TRUNCATION_MARKER}`;
}

function buildFullTitle(test: TestCase): string {
  const parts: string[] = [];
  let current: Suite | undefined = test.parent;
  while (current) {
    if (current.title && current.type === "describe") {
      parts.unshift(current.title);
    }
    current = current.parent;
  }
  parts.push(test.title);
  return parts.join(" > ");
}

function filterStackToUserCode(stack: string): string {
  return stack
    .split("\n")
    .filter((line) => {
      if (!line.includes("    at ")) {
        return true;
      }
      return !line.includes("node_modules") && !line.includes("node:internal");
    })
    .join("\n");
}

function extractDiff(message: string): { expected: string; actual: string } | undefined {
  const lines = message.split("\n");
  let expectedValue: string | undefined;
  let actualValue: string | undefined;

  for (const line of lines) {
    const expectedMatch = /^Expected\b[^:]*:[ \t]*(.+)/i.exec(line);
    if (expectedMatch?.[1]) {
      expectedValue = stripAnsi(expectedMatch[1]).trim();
    }
    const receivedMatch = /^Received\b[^:]*:[ \t]*(.+)/i.exec(line);
    if (receivedMatch?.[1]) {
      actualValue = stripAnsi(receivedMatch[1]).trim();
    }
  }

  if (expectedValue && actualValue) {
    return { expected: expectedValue, actual: actualValue };
  }

  return undefined;
}

function buildTestError(error: PlaywrightTestError): TestError {
  const testError: TestError = {
    message: stripAnsi(error.message ?? "Unknown error"),
  };

  if (error.stack) {
    testError.stack = filterStackToUserCode(stripAnsi(error.stack));
  }
  if (error.snippet) {
    testError.snippet = stripAnsi(error.snippet);
  }

  const diff = extractDiff(error.message ?? "");
  if (diff) {
    testError.diff = diff;
  }

  if (error.location) {
    const { file, line, column } = error.location;
    testError.location = { file, line, column };
  }

  return testError;
}

function statusIndicator(status: TestStatus): string {
  switch (status) {
    case "passed": {
      return ".";
    }
    case "failed": {
      return "F";
    }
    case "timedOut": {
      return "T";
    }
    case "interrupted": {
      return "I";
    }
    case "skipped": {
      return "S";
    }
    default: {
      return "?";
    }
  }
}

function collectStdio(result: TestResult, channel: "stdout" | "stderr"): string {
  const text = result[channel]
    .map((chunk) => (typeof chunk === "string" ? chunk : chunk.toString("utf8")))
    .join("");
  return capOutput(stripAnsi(text));
}

function extractFirstLine(text: string | undefined): string | undefined {
  if (!text) {
    return undefined;
  }

  const firstLine = stripAnsi(text).split("\n")[0]?.trim();
  if (!firstLine) {
    return undefined;
  }

  return firstLine;
}

function flattenSteps(
  steps: readonly TestStep[],
  attemptStartTimeMs: number,
  depth = 0,
): FlatStep[] {
  const flattenedSteps: FlatStep[] = [];

  for (const step of steps) {
    const flatStep: FlatStep = {
      title: step.title,
      category: step.category,
      durationMs: step.duration,
      depth,
      offsetMs: step.startTime.getTime() - attemptStartTimeMs,
    };

    const error = extractFirstLine(step.error?.message);
    if (error) {
      flatStep.error = error;
    }

    flattenedSteps.push(flatStep, ...flattenSteps(step.steps, attemptStartTimeMs, depth + 1));
  }

  return flattenedSteps;
}

function capText(value: string, limit: number): string {
  if (value.length <= limit) {
    return value;
  }
  return `${value.slice(0, limit - TRUNCATION_MARKER.length)}${TRUNCATION_MARKER}`;
}

function capNetworkBody(body: string): string {
  return capText(body, NETWORK_BODY_CAP);
}

function capConsoleMessageText(text: string): string {
  return capText(text, CONSOLE_TEXT_CAP);
}

function isJsonOrTextContentType(contentType: string | undefined): boolean {
  if (!contentType) {
    return false;
  }

  const normalizedContentType = contentType.split(";")[0]?.trim().toLowerCase();
  if (!normalizedContentType) {
    return false;
  }

  return normalizedContentType.startsWith("text/") || normalizedContentType.includes("json");
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (typeof value === "object" && value !== null) {
    return value as Record<string, unknown>;
  }
  return undefined;
}

function asString(value: unknown): string | undefined {
  if (typeof value === "string") {
    return value;
  }
  return undefined;
}

function asNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  return undefined;
}

function asBoolean(value: unknown): boolean | undefined {
  if (typeof value === "boolean") {
    return value;
  }
  return undefined;
}

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

function isHighSignalConsoleEntry(entry: ConsoleEntry): boolean {
  return HIGH_SIGNAL_CONSOLE_ENTRY_TYPES.has(entry.type);
}

function canImproveConsoleSignal(consoleMessages: ConsoleEntry[]): boolean {
  if (consoleMessages.length < CONSOLE_MESSAGES_CAP) {
    return true;
  }
  return consoleMessages.some((entry) => !isHighSignalConsoleEntry(entry));
}

function appendConsoleEntryWithPriority(
  consoleMessages: ConsoleEntry[],
  consoleEntry: ConsoleEntry,
): void {
  if (consoleMessages.length < CONSOLE_MESSAGES_CAP) {
    consoleMessages.push(consoleEntry);
    return;
  }

  if (!isHighSignalConsoleEntry(consoleEntry)) {
    return;
  }

  const firstLowSignalIndex = consoleMessages.findIndex(
    (entry) => !isHighSignalConsoleEntry(entry),
  );
  if (firstLowSignalIndex === -1) {
    return;
  }

  consoleMessages.splice(firstLowSignalIndex, 1);
  consoleMessages.push(consoleEntry);
}

function isHighSignalNetworkRequest(request: NetworkRequest): boolean {
  return (
    (request.resourceType !== undefined && HIGH_SIGNAL_RESOURCE_TYPES.has(request.resourceType)) ||
    request.status >= 400 ||
    request.failureText !== undefined ||
    request.wasAborted === true
  );
}

function canImproveNetworkSignal(networkRequests: NetworkRequest[]): boolean {
  if (networkRequests.length < NETWORK_REQUESTS_CAP) {
    return true;
  }
  return networkRequests.some((request) => !isHighSignalNetworkRequest(request));
}

function appendNetworkRequestWithPriority(
  networkRequests: NetworkRequest[],
  networkRequest: NetworkRequest,
): void {
  if (networkRequests.length < NETWORK_REQUESTS_CAP) {
    networkRequests.push(networkRequest);
    return;
  }

  if (!isHighSignalNetworkRequest(networkRequest)) {
    return;
  }

  const firstLowSignalIndex = networkRequests.findIndex(
    (request) => !isHighSignalNetworkRequest(request),
  );
  if (firstLowSignalIndex === -1) {
    return;
  }

  networkRequests.splice(firstLowSignalIndex, 1);
  networkRequests.push(networkRequest);
}

function annotateRedirectChains(networkRequests: NetworkRequest[]): void {
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

function findScreenshotAttachment<T extends { name: string; contentType: string; path?: string }>(
  attachments: readonly T[],
): T | undefined {
  let firstImageFallback: T | undefined;
  for (const attachment of attachments) {
    if (!attachment.path) {
      continue;
    }
    if (attachment.name.toLowerCase().includes("screenshot")) {
      return attachment;
    }
    if (!firstImageFallback && attachment.contentType.startsWith("image/")) {
      firstImageFallback = attachment;
    }
  }
  return firstImageFallback;
}

function extractFailureArtifacts(
  status: TestStatus,
  attachments: TestAttachment[],
): FailureArtifacts | undefined {
  if (status === "passed" || status === "skipped") {
    return undefined;
  }

  const failureArtifacts: FailureArtifacts = {};
  for (const attachment of attachments) {
    if (!attachment.path) {
      continue;
    }
    if (
      !failureArtifacts.videoPath &&
      (attachment.contentType.startsWith("video/") ||
        attachment.name.toLowerCase().includes("video"))
    ) {
      failureArtifacts.videoPath = attachment.path;
    }
  }

  return failureArtifacts;
}

function embedScreenshot(failureArtifacts: FailureArtifacts, absoluteScreenshotPath: string): void {
  try {
    // eslint-disable-next-line security/detect-non-literal-fs-filename
    const raw = readFileSync(absoluteScreenshotPath);
    // base64 expands ~4/3x; skip conversion when raw bytes cannot possibly fit
    if (raw.length > Math.floor((SCREENSHOT_BASE64_CAP * 3) / 4)) {
      return;
    }
    const base64 = raw.toString("base64");
    if (base64.length <= SCREENSHOT_BASE64_CAP) {
      failureArtifacts.screenshotBase64 = base64;
    }
  } catch {
    // Screenshot file may not exist or be readable — silently skip
  }
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

function findEndOfCentralDirectoryOffset(zipBuffer: Buffer): number {
  const minimumEndRecordLength = 22;
  const maxCommentLength = 65_535;
  const minimumOffset = Math.max(0, zipBuffer.length - minimumEndRecordLength - maxCommentLength);

  for (let offset = zipBuffer.length - minimumEndRecordLength; offset >= minimumOffset; offset--) {
    if (zipBuffer.readUInt32LE(offset) === ZIP_END_OF_CENTRAL_DIRECTORY_SIGNATURE) {
      return offset;
    }
  }

  return -1;
}

function readZipArchiveEntries(zipPath: string): Record<string, Uint8Array> {
  // eslint-disable-next-line security/detect-non-literal-fs-filename
  const zipBuffer = readFileSync(zipPath);
  const endOfCentralDirectoryOffset = findEndOfCentralDirectoryOffset(zipBuffer);
  if (endOfCentralDirectoryOffset < 0) {
    return {};
  }

  const centralDirectoryEntries = zipBuffer.readUInt16LE(endOfCentralDirectoryOffset + 10);
  const centralDirectoryOffset = zipBuffer.readUInt32LE(endOfCentralDirectoryOffset + 16);
  const archiveEntries: Record<string, Uint8Array> = {};

  let cursor = centralDirectoryOffset;
  for (let index = 0; index < centralDirectoryEntries; index++) {
    if (cursor + 46 > zipBuffer.length) {
      break;
    }
    if (zipBuffer.readUInt32LE(cursor) !== ZIP_CENTRAL_DIRECTORY_FILE_HEADER_SIGNATURE) {
      break;
    }

    const compressionMethod = zipBuffer.readUInt16LE(cursor + 10);
    const compressedSize = zipBuffer.readUInt32LE(cursor + 20);
    const fileNameLength = zipBuffer.readUInt16LE(cursor + 28);
    const extraFieldLength = zipBuffer.readUInt16LE(cursor + 30);
    const fileCommentLength = zipBuffer.readUInt16LE(cursor + 32);
    const localHeaderOffset = zipBuffer.readUInt32LE(cursor + 42);

    const fileNameStart = cursor + 46;
    const fileNameEnd = fileNameStart + fileNameLength;
    if (fileNameEnd > zipBuffer.length) {
      break;
    }
    const fileName = zipBuffer.subarray(fileNameStart, fileNameEnd).toString("utf8");

    if (localHeaderOffset + 30 > zipBuffer.length) {
      cursor += 46 + fileNameLength + extraFieldLength + fileCommentLength;
      continue;
    }
    if (zipBuffer.readUInt32LE(localHeaderOffset) !== ZIP_LOCAL_FILE_HEADER_SIGNATURE) {
      cursor += 46 + fileNameLength + extraFieldLength + fileCommentLength;
      continue;
    }

    const localFileNameLength = zipBuffer.readUInt16LE(localHeaderOffset + 26);
    const localExtraFieldLength = zipBuffer.readUInt16LE(localHeaderOffset + 28);
    const compressedDataStart =
      localHeaderOffset + 30 + localFileNameLength + localExtraFieldLength;
    const compressedDataEnd = compressedDataStart + compressedSize;
    if (compressedDataEnd > zipBuffer.length) {
      cursor += 46 + fileNameLength + extraFieldLength + fileCommentLength;
      continue;
    }

    const compressedData = zipBuffer.subarray(compressedDataStart, compressedDataEnd);
    let entryContent: Buffer | undefined;

    if (compressionMethod === ZIP_COMPRESSION_STORED) {
      entryContent = Buffer.from(compressedData);
    } else if (compressionMethod === ZIP_COMPRESSION_DEFLATE) {
      try {
        entryContent = inflateRawSync(compressedData);
      } catch {
        cursor += 46 + fileNameLength + extraFieldLength + fileCommentLength;
        continue;
      }
    }

    if (entryContent) {
      archiveEntries[fileName] = new Uint8Array(entryContent);
    }

    cursor += 46 + fileNameLength + extraFieldLength + fileCommentLength;
  }

  return archiveEntries;
}

interface MonotonicAnchor {
  wallTimeMs: number;
  monotonicTimeMs: number;
}

function monotonicToOffsetMs(
  monotonicTimeMs: number,
  anchor: MonotonicAnchor,
  attemptStartTimeMs: number,
): number {
  const wallTimeMs = anchor.wallTimeMs + (monotonicTimeMs - anchor.monotonicTimeMs);
  return Math.round(wallTimeMs) - attemptStartTimeMs;
}

function extractMonotonicAnchor(traceContent: string): MonotonicAnchor | undefined {
  const firstNewlineIndex = traceContent.indexOf("\n");
  const firstLine = (
    firstNewlineIndex === -1 ? traceContent : traceContent.slice(0, firstNewlineIndex)
  ).trim();
  if (!firstLine) {
    return undefined;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(firstLine);
  } catch {
    return undefined;
  }

  const record = asRecord(parsed);
  if (record?.["type"] !== "context-options") {
    return undefined;
  }

  const wallTimeMs = asNumber(record["wallTime"]);
  const monotonicTimeMs = asNumber(record["monotonicTime"]);
  if (wallTimeMs !== undefined && monotonicTimeMs !== undefined) {
    return { wallTimeMs, monotonicTimeMs };
  }

  return undefined;
}

function computeNetworkOffsetMs(
  snapshotRecord: Record<string, unknown>,
  anchor: MonotonicAnchor | undefined,
  attemptStartTimeMs: number,
): number | undefined {
  const monotonicTimeMs = asNumber(snapshotRecord["_monotonicTime"]);
  if (monotonicTimeMs !== undefined && anchor) {
    return monotonicToOffsetMs(monotonicTimeMs, anchor, attemptStartTimeMs);
  }

  const startedDateTime = asString(snapshotRecord["startedDateTime"]);
  if (startedDateTime) {
    const parsedMs = new Date(startedDateTime).getTime();
    if (!Number.isNaN(parsedMs)) {
      return parsedMs - attemptStartTimeMs;
    }
  }

  return undefined;
}

function extractTraceId(
  requestHeaders: Record<string, string> | undefined,
  responseHeaders: Record<string, string> | undefined,
): string | undefined {
  return responseHeaders?.["x-datadog-trace-id"] ?? requestHeaders?.["x-datadog-trace-id"];
}

function buildNetworkRequestFromEvent(
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

  const traceId = extractTraceId(requestHeaders, responseHeaders);
  if (traceId) {
    networkRequest.traceId = traceId;
  }

  const requestBody = readTraceResourceBody(archiveEntries, asRecord(requestRecord["postData"]));
  if (requestBody !== undefined) {
    networkRequest.requestBody = requestBody;
  }

  const responseBody = readTraceResourceBody(archiveEntries, asRecord(responseRecord["content"]));
  if (responseBody !== undefined) {
    networkRequest.responseBody = responseBody;
  }

  return networkRequest;
}

function extractPageErrorText(eventRecord: Record<string, unknown>): string | undefined {
  const paramsRecord = asRecord(eventRecord["params"]);
  if (!paramsRecord) {
    return undefined;
  }

  const error = paramsRecord["error"];
  const errorAsText = asString(error);
  if (errorAsText) {
    return errorAsText;
  }

  const errorRecord = asRecord(error);
  return asString(errorRecord?.["message"]);
}

function computeConsoleOffsetMs(
  eventRecord: Record<string, unknown>,
  anchor: MonotonicAnchor | undefined,
  attemptStartTimeMs: number,
): number | undefined {
  const time = asNumber(eventRecord["time"]);
  if (time !== undefined && anchor) {
    return monotonicToOffsetMs(time, anchor, attemptStartTimeMs);
  }
  return undefined;
}

function buildConsoleEntryFromEvent(
  eventRecord: Record<string, unknown>,
  anchor: MonotonicAnchor | undefined,
  attemptStartTimeMs: number,
): ConsoleEntry | undefined {
  const offsetMs = computeConsoleOffsetMs(eventRecord, anchor, attemptStartTimeMs);

  if (eventRecord["type"] === "console") {
    const messageType = asString(eventRecord["messageType"])?.toLowerCase();
    if (messageType !== "warning" && messageType !== "error") {
      return undefined;
    }

    const text = asString(eventRecord["text"]);
    if (!text) {
      return undefined;
    }

    return {
      type: messageType,
      text: capConsoleMessageText(stripAnsi(text)),
      ...(offsetMs !== undefined && { offsetMs }),
    };
  }

  if (eventRecord["type"] === "event" && eventRecord["method"] === "pageError") {
    const pageErrorText = extractPageErrorText(eventRecord);
    if (!pageErrorText) {
      return undefined;
    }

    return {
      type: "pageerror",
      text: capConsoleMessageText(stripAnsi(pageErrorText)),
      ...(offsetMs !== undefined && { offsetMs }),
    };
  }

  if (eventRecord["type"] === "event" && eventRecord["method"] === "pageClosed") {
    return {
      type: "page-closed",
      text: "Page closed",
      ...(offsetMs !== undefined && { offsetMs }),
    };
  }

  if (
    eventRecord["type"] === "event" &&
    (eventRecord["method"] === "pageCrashed" || eventRecord["method"] === "pageCrash")
  ) {
    const pageCrashText = extractPageErrorText(eventRecord) ?? "Page crashed";
    return {
      type: "page-crashed",
      text: capConsoleMessageText(stripAnsi(pageCrashText)),
      ...(offsetMs !== undefined && { offsetMs }),
    };
  }

  return undefined;
}

interface TraceLineDiagnostics {
  networkRequest?: NetworkRequest;
  consoleEntry?: ConsoleEntry;
}

function parseTraceLine(
  line: string,
  archiveEntries: Record<string, Uint8Array>,
  anchor: MonotonicAnchor | undefined,
  attemptStartTimeMs: number,
): TraceLineDiagnostics | undefined {
  let parsedLine: unknown;
  try {
    parsedLine = JSON.parse(line);
  } catch {
    return undefined;
  }

  const eventRecord = asRecord(parsedLine);
  if (!eventRecord) {
    return undefined;
  }

  const traceLineDiagnostics: TraceLineDiagnostics = {};
  const networkRequest = buildNetworkRequestFromEvent(
    eventRecord,
    archiveEntries,
    anchor,
    attemptStartTimeMs,
  );
  if (networkRequest) {
    traceLineDiagnostics.networkRequest = networkRequest;
  }

  const consoleEntry = buildConsoleEntryFromEvent(eventRecord, anchor, attemptStartTimeMs);
  if (consoleEntry) {
    traceLineDiagnostics.consoleEntry = consoleEntry;
  }

  if (!traceLineDiagnostics.networkRequest && !traceLineDiagnostics.consoleEntry) {
    return undefined;
  }

  return traceLineDiagnostics;
}

interface TraceDiagnostics {
  networkRequests: NetworkRequest[];
  consoleMessages: ConsoleEntry[];
}

function parseTraceDiagnostics(tracePath: string, attemptStartTimeMs: number): TraceDiagnostics {
  const networkRequests: NetworkRequest[] = [];
  const consoleMessages: ConsoleEntry[] = [];
  let archiveEntries: Record<string, Uint8Array>;

  try {
    archiveEntries = readZipArchiveEntries(tracePath);
  } catch {
    return { networkRequests, consoleMessages };
  }

  // First pass: extract monotonic anchor from .trace files
  let anchor: MonotonicAnchor | undefined;
  for (const [entryName, entryContent] of Object.entries(archiveEntries)) {
    if (!entryName.endsWith(".trace")) {
      continue;
    }
    try {
      const entryText = Buffer.from(entryContent).toString("utf8");
      anchor = extractMonotonicAnchor(entryText);
      if (anchor) {
        break;
      }
    } catch {
      continue;
    }
  }

  // Second pass: parse events
  for (const [entryName, entryContent] of Object.entries(archiveEntries)) {
    if (!canImproveNetworkSignal(networkRequests) && !canImproveConsoleSignal(consoleMessages)) {
      break;
    }

    try {
      if (!entryName.endsWith(".trace") && !entryName.endsWith(".network")) {
        continue;
      }

      const entryText = Buffer.from(entryContent).toString("utf8");
      const lines = entryText.split("\n");

      for (const line of lines) {
        if (
          !canImproveNetworkSignal(networkRequests) &&
          !canImproveConsoleSignal(consoleMessages)
        ) {
          break;
        }
        if (!line.trim()) {
          continue;
        }

        let traceLineDiagnostics: TraceLineDiagnostics | undefined;
        try {
          traceLineDiagnostics = parseTraceLine(line, archiveEntries, anchor, attemptStartTimeMs);
        } catch {
          continue;
        }
        if (!traceLineDiagnostics) {
          continue;
        }

        if (traceLineDiagnostics.networkRequest) {
          appendNetworkRequestWithPriority(networkRequests, traceLineDiagnostics.networkRequest);
        }
        if (traceLineDiagnostics.consoleEntry) {
          appendConsoleEntryWithPriority(consoleMessages, traceLineDiagnostics.consoleEntry);
        }
      }
    } catch {
      continue;
    }
  }

  return { networkRequests, consoleMessages };
}

interface AttachmentsCollection {
  attachments: TestAttachment[];
  tracePaths: string[];
}

function collectAttachments(result: TestResult, outputDirectory: string): AttachmentsCollection {
  const attachments: TestAttachment[] = [];
  const tracePaths: string[] = [];

  for (const attachment of result.attachments) {
    const contentType = attachment.contentType ?? "application/octet-stream";
    attachments.push({
      name: attachment.name,
      contentType,
      ...(attachment.path && { path: path.relative(outputDirectory, attachment.path) }),
    });

    if (
      contentType === "application/zip" &&
      attachment.path &&
      attachment.name.toLowerCase().includes("trace")
    ) {
      tracePaths.push(attachment.path);
    }
  }

  return { attachments, tracePaths };
}

function collectTraceDiagnosticsFromAttachments(
  tracePaths: string[],
  attemptStartTimeMs: number,
): TraceDiagnostics {
  const networkRequests: NetworkRequest[] = [];
  const consoleMessages: ConsoleEntry[] = [];

  for (const tracePath of tracePaths) {
    if (!canImproveNetworkSignal(networkRequests) && !canImproveConsoleSignal(consoleMessages)) {
      break;
    }

    const traceDiagnostics = parseTraceDiagnostics(tracePath, attemptStartTimeMs);
    for (const request of traceDiagnostics.networkRequests) {
      appendNetworkRequestWithPriority(networkRequests, request);
    }

    for (const consoleEntry of traceDiagnostics.consoleMessages) {
      appendConsoleEntryWithPriority(consoleMessages, consoleEntry);
    }
  }

  annotateRedirectChains(networkRequests);
  return { networkRequests, consoleMessages };
}

interface BuildAttemptResultInput {
  result: TestResult;
  errors: TestError[];
  attachments: TestAttachment[];
  network: NetworkRequest[];
  consoleMessages: ConsoleEntry[];
}

function buildTimeline(
  steps: FlatStep[],
  network: NetworkRequest[],
  consoleMessages: ConsoleEntry[],
): TimelineEntry[] {
  const stepEntries: TimelineStepEntry[] = steps.map((step) => ({
    kind: "step" as const,
    offsetMs: step.offsetMs,
    title: step.title,
    category: step.category,
    durationMs: step.durationMs,
    depth: step.depth,
    ...(step.error && { error: step.error }),
  }));

  const networkEntries: TimelineNetworkEntry[] = network
    .filter(
      (request): request is NetworkRequest & { offsetMs: number } => request.offsetMs !== undefined,
    )
    .map((request) => ({
      kind: "network" as const,
      offsetMs: request.offsetMs,
      method: request.method,
      url: request.url,
      status: request.status,
      ...(request.durationMs !== undefined && { durationMs: request.durationMs }),
      ...(request.resourceType && { resourceType: request.resourceType }),
      ...(request.traceId && { traceId: request.traceId }),
      ...(request.failureText && { failureText: request.failureText }),
      ...(request.wasAborted !== undefined && { wasAborted: request.wasAborted }),
    }));

  const consoleEntries: TimelineConsoleEntry[] = consoleMessages
    .filter((entry): entry is ConsoleEntry & { offsetMs: number } => entry.offsetMs !== undefined)
    .map((entry) => ({
      kind: "console" as const,
      offsetMs: entry.offsetMs,
      type: entry.type,
      text: entry.text,
    }));

  // eslint-disable-next-line no-use-extend-native/no-use-extend-native
  return [...stepEntries, ...networkEntries, ...consoleEntries].toSorted(
    (a, b) => a.offsetMs - b.offsetMs,
  );
}

function buildAttemptResult(input: BuildAttemptResultInput): AttemptResult {
  const { result, errors, attachments, network, consoleMessages } = input;
  const failureArtifacts = extractFailureArtifacts(result.status, attachments);

  if (failureArtifacts) {
    const absoluteScreenshotPath = findScreenshotAttachment(result.attachments)?.path;
    if (absoluteScreenshotPath) {
      embedScreenshot(failureArtifacts, absoluteScreenshotPath);
    }
  }

  const hasFailureContent =
    failureArtifacts !== undefined &&
    (failureArtifacts.screenshotBase64 !== undefined || failureArtifacts.videoPath !== undefined);

  const attemptStartTimeMs = result.startTime.getTime();
  const steps = flattenSteps(result.steps, attemptStartTimeMs);
  const timeline = buildTimeline(steps, network, consoleMessages);

  const attemptResult: AttemptResult = {
    attempt: result.retry + 1,
    status: result.status,
    durationMs: result.duration,
    startTime: result.startTime.toISOString(),
    workerIndex: result.workerIndex,
    parallelIndex: result.parallelIndex,
    steps,
    stdout: collectStdio(result, "stdout"),
    stderr: collectStdio(result, "stderr"),
    attachments,
    network,
    consoleMessages,
    timeline,
    ...(hasFailureContent && { failureArtifacts }),
  };

  const [firstError] = errors;
  if (firstError) {
    attemptResult.error = firstError;
  }

  return attemptResult;
}

export default class LlmReporter implements Reporter {
  private readonly outputFile: string;
  private config: FullConfig | undefined;
  private readonly entriesById = new Map<string, LlmTestEntry>();
  private readonly globalErrors: GlobalError[] = [];
  private startTimeMs = 0;

  public constructor(options: LlmReporterOptions = {}) {
    this.outputFile = options.outputFile ?? "test-results/llm-report.json";
  }

  public onBegin(config: FullConfig, _suite: Suite): void {
    this.config = config;
    this.startTimeMs = Date.now();
    this.entriesById.clear();
    this.globalErrors.length = 0;
    rmSync(this.outputFile, { force: true });
  }

  public onTestEnd(test: TestCase, result: TestResult): void {
    const config = this.config;
    if (!config) {
      return;
    }

    const file = path.relative(config.rootDir, test.location.file);
    const fullTitle = buildFullTitle(test);
    const project = test.parent.project()?.name ?? "";
    const status: TestStatus = result.status;
    const retries = test.results.length - 1;
    const isFlaky = status === "passed" && retries > 0;

    process.stdout.write(statusIndicator(status));

    const outputDirectory = test.parent.project()?.outputDir ?? config.rootDir;
    const { attachments, tracePaths } = collectAttachments(result, outputDirectory);
    const errors = result.errors.map(buildTestError);
    const attemptStartTimeMs = result.startTime.getTime();
    const traceDiagnostics = collectTraceDiagnosticsFromAttachments(tracePaths, attemptStartTimeMs);
    const attemptResult = buildAttemptResult({
      result,
      errors,
      attachments,
      network: traceDiagnostics.networkRequests,
      consoleMessages: traceDiagnostics.consoleMessages,
    });

    const existingEntry = this.entriesById.get(test.id);
    if (existingEntry) {
      existingEntry.title = fullTitle;
      existingEntry.status = status;
      existingEntry.flaky = isFlaky;
      existingEntry.durationMs = result.duration;
      existingEntry.location = { file, line: test.location.line, column: test.location.column };
      existingEntry.project = project;
      existingEntry.tags = test.tags;
      existingEntry.annotations = test.annotations;
      existingEntry.retries = retries;
      existingEntry.errors = errors;
      if (attemptResult.error) {
        existingEntry.error = attemptResult.error;
      } else {
        delete existingEntry.error;
      }
      existingEntry.attachments = attachments;
      existingEntry.stdout = attemptResult.stdout;
      existingEntry.stderr = attemptResult.stderr;
      existingEntry.steps = attemptResult.steps;
      existingEntry.network = attemptResult.network;
      existingEntry.timeline = attemptResult.timeline;
      existingEntry.attempts.push(attemptResult);
      return;
    }

    const entry: LlmTestEntry = {
      id: test.id,
      title: fullTitle,
      status,
      flaky: isFlaky,
      durationMs: result.duration,
      location: { file, line: test.location.line, column: test.location.column },
      project,
      tags: test.tags,
      annotations: test.annotations,
      retries,
      errors,
      ...(attemptResult.error && { error: attemptResult.error }),
      attachments,
      stdout: attemptResult.stdout,
      stderr: attemptResult.stderr,
      attempts: [attemptResult],
      steps: attemptResult.steps,
      network: attemptResult.network,
      timeline: attemptResult.timeline,
    };

    this.entriesById.set(test.id, entry);
  }

  public onError(error: PlaywrightTestError): void {
    const globalError: GlobalError = {
      message: stripAnsi(error.message ?? "Unknown error"),
    };
    if (error.stack) {
      globalError.stack = filterStackToUserCode(stripAnsi(error.stack));
    }
    this.globalErrors.push(globalError);
  }

  public onEnd(_result: FullResult): void {
    const durationMs = Date.now() - this.startTimeMs;
    const config = this.config;
    if (!config) {
      // eslint-disable-next-line no-console
      console.error("LlmReporter: onEnd called without onBegin — skipping report.");
      return;
    }

    const entries = [...this.entriesById.values()];
    const summary: TestSummary = {
      total: entries.length,
      passed: 0,
      failed: 0,
      flaky: 0,
      skipped: 0,
      timedOut: 0,
      interrupted: 0,
    };

    for (const entry of entries) {
      if (entry.flaky) {
        summary.flaky++;
      } else {
        summary[entry.status]++;
      }
    }

    const report: LlmTestReport = {
      schemaVersion: 2,
      timestamp: new Date(this.startTimeMs).toISOString(),
      durationMs,
      summary,
      environment: {
        playwrightVersion: config.version,
        nodeVersion: process.version,
        os: process.platform,
        workers: config.workers,
        retries: Math.max(0, ...config.projects.map((p) => p.retries)),
        projects: config.projects.map((p) => p.name),
      },
      tests: entries,
      globalErrors: this.globalErrors,
    };

    const directory = path.dirname(this.outputFile);
    // eslint-disable-next-line security/detect-non-literal-fs-filename
    mkdirSync(directory, { recursive: true });
    const temporaryFile = path.join(directory, `.llm-report-${randomUUID()}.tmp`);
    try {
      // eslint-disable-next-line security/detect-non-literal-fs-filename
      writeFileSync(temporaryFile, JSON.stringify(report, undefined, 2));
      // eslint-disable-next-line security/detect-non-literal-fs-filename
      renameSync(temporaryFile, this.outputFile);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(`LlmReporter: Failed to write report to ${this.outputFile}:`, error);
    } finally {
      rmSync(temporaryFile, { force: true });
    }

    const durationSeconds = (durationMs / 1000).toFixed(1);
    const parts = [
      `${summary.total} tests`,
      `${summary.passed} passed`,
      `${summary.failed} failed`,
      `${summary.skipped} skipped`,
      ...(summary.flaky > 0 ? [`${summary.flaky} flaky`] : []),
      ...(summary.timedOut > 0 ? [`${summary.timedOut} timedOut`] : []),
      ...(summary.interrupted > 0 ? [`${summary.interrupted} interrupted`] : []),
    ];
    const consoleSummary = `\n${parts.join(" | ")} (${durationSeconds}s)\n`;
    process.stdout.write(consoleSummary);
    process.stdout.write(`Report: ${this.outputFile}\n`);
  }
}
