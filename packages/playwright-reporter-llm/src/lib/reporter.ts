import { randomUUID } from "node:crypto";
import { mkdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

import type {
  FullConfig,
  FullResult,
  Reporter,
  Suite,
  TestCase,
  TestError as PlaywrightTestError,
  TestResult,
} from "@playwright/test/reporter";

import type {
  GlobalError,
  LlmReporterOptions,
  LlmTestEntry,
  LlmTestReport,
  TestAttachment,
  TestError,
  TestStatus,
  TestSummary,
} from "./types";

const STDOUT_CAP = 4096;
const TRUNCATION_MARKER = "[truncated]";

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
    const attachments: TestAttachment[] = result.attachments.map((a) => ({
      name: a.name,
      contentType: a.contentType,
      ...(a.path && { path: path.relative(outputDirectory, a.path) }),
    }));

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
      errors: result.errors.map(buildTestError),
      attachments,
      stdout: collectStdio(result, "stdout"),
      stderr: collectStdio(result, "stderr"),
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
