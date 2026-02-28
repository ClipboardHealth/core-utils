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
  FlatStep,
  GlobalError,
  LlmReporterOptions,
  LlmTestEntry,
  LlmTestReport,
  NetworkRequest,
  TestAttachment,
  TestError,
  TestStatus,
  TestSummary,
} from "./types";

const STDOUT_CAP = 4096;
const NETWORK_BODY_CAP = 2048;
const CONSOLE_MESSAGES_CAP = 50;
const TRUNCATION_MARKER = "[truncated]";
const ZIP_END_OF_CENTRAL_DIRECTORY_SIGNATURE = 101_010_256;
const ZIP_CENTRAL_DIRECTORY_FILE_HEADER_SIGNATURE = 33_639_248;
const ZIP_LOCAL_FILE_HEADER_SIGNATURE = 67_324_752;
const ZIP_COMPRESSION_STORED = 0;
const ZIP_COMPRESSION_DEFLATE = 8;

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

function flattenSteps(steps: readonly TestStep[], depth = 0): FlatStep[] {
  const flattenedSteps: FlatStep[] = [];

  for (const step of steps) {
    const flatStep: FlatStep = {
      title: step.title,
      category: step.category,
      durationMs: step.duration,
      depth,
    };

    const error = extractFirstLine(step.error?.message);
    if (error) {
      flatStep.error = error;
    }

    flattenedSteps.push(flatStep, ...flattenSteps(step.steps, depth + 1));
  }

  return flattenedSteps;
}

function capNetworkBody(body: string): string {
  if (body.length <= NETWORK_BODY_CAP) {
    return body;
  }
  return body.slice(0, NETWORK_BODY_CAP);
}

function capConsoleMessageText(text: string): string {
  if (text.length <= NETWORK_BODY_CAP) {
    return text;
  }
  return text.slice(0, NETWORK_BODY_CAP);
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
      entryContent = inflateRawSync(compressedData);
    }

    if (entryContent) {
      archiveEntries[fileName] = new Uint8Array(entryContent);
    }

    cursor += 46 + fileNameLength + extraFieldLength + fileCommentLength;
  }

  return archiveEntries;
}

function buildNetworkRequestFromEvent(
  eventRecord: Record<string, unknown>,
  archiveEntries: Record<string, Uint8Array>,
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

  const durationMs = asNumber(snapshotRecord["time"]);
  if (durationMs !== undefined && durationMs >= 0) {
    networkRequest.durationMs = durationMs;
  }

  const resourceType = asString(snapshotRecord["_resourceType"]);
  if (resourceType) {
    networkRequest.resourceType = resourceType;
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

function buildConsoleEntryFromEvent(
  eventRecord: Record<string, unknown>,
): ConsoleEntry | undefined {
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
  const networkRequest = buildNetworkRequestFromEvent(eventRecord, archiveEntries);
  if (networkRequest) {
    traceLineDiagnostics.networkRequest = networkRequest;
  }

  const consoleEntry = buildConsoleEntryFromEvent(eventRecord);
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

function parseTraceDiagnostics(tracePath: string): TraceDiagnostics {
  try {
    const archiveEntries = readZipArchiveEntries(tracePath);
    const networkRequests: NetworkRequest[] = [];
    const consoleMessages: ConsoleEntry[] = [];

    for (const [entryName, entryContent] of Object.entries(archiveEntries)) {
      if (!entryName.endsWith(".trace") && !entryName.endsWith(".network")) {
        continue;
      }

      const entryText = Buffer.from(entryContent).toString("utf8");
      const lines = entryText.split("\n");

      for (const line of lines) {
        if (!line.trim()) {
          continue;
        }

        const traceLineDiagnostics = parseTraceLine(line, archiveEntries);
        if (!traceLineDiagnostics) {
          continue;
        }

        if (traceLineDiagnostics.networkRequest) {
          networkRequests.push(traceLineDiagnostics.networkRequest);
        }
        if (traceLineDiagnostics.consoleEntry && consoleMessages.length < CONSOLE_MESSAGES_CAP) {
          consoleMessages.push(traceLineDiagnostics.consoleEntry);
        }
      }
    }

    return { networkRequests, consoleMessages };
  } catch {
    return { networkRequests: [], consoleMessages: [] };
  }
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

    if (contentType === "application/zip" && attachment.path) {
      tracePaths.push(attachment.path);
    }
  }

  return { attachments, tracePaths };
}

function collectTraceDiagnosticsFromAttachments(tracePaths: string[]): TraceDiagnostics {
  const networkRequests: NetworkRequest[] = [];
  const consoleMessages: ConsoleEntry[] = [];

  for (const tracePath of tracePaths) {
    const traceDiagnostics = parseTraceDiagnostics(tracePath);
    networkRequests.push(...traceDiagnostics.networkRequests);

    if (consoleMessages.length >= CONSOLE_MESSAGES_CAP) {
      continue;
    }

    const remainingCapacity = CONSOLE_MESSAGES_CAP - consoleMessages.length;
    consoleMessages.push(...traceDiagnostics.consoleMessages.slice(0, remainingCapacity));
  }

  return { networkRequests, consoleMessages };
}

interface BuildAttemptResultInput {
  result: TestResult;
  errors: TestError[];
  attachments: TestAttachment[];
  network: NetworkRequest[];
  consoleMessages: ConsoleEntry[];
}

function buildAttemptResult(input: BuildAttemptResultInput): AttemptResult {
  const { result, errors, attachments, network, consoleMessages } = input;
  const attemptResult: AttemptResult = {
    attempt: result.retry + 1,
    status: result.status,
    durationMs: result.duration,
    startTime: result.startTime.toISOString(),
    workerIndex: result.workerIndex,
    parallelIndex: result.parallelIndex,
    steps: flattenSteps(result.steps),
    stdout: collectStdio(result, "stdout"),
    stderr: collectStdio(result, "stderr"),
    attachments,
    network,
    consoleMessages,
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
    const traceDiagnostics = collectTraceDiagnosticsFromAttachments(tracePaths);
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
      schemaVersion: 1,
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
