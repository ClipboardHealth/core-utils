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

import { buildAttemptResult } from "./internal/attemptBuilder";
import {
  buildFullTitle,
  buildTestError,
  filterStackToUserCode,
  statusIndicator,
} from "./internal/testResults";
import { stripAnsi } from "./internal/textProcessing";
import {
  collectAttachments,
  collectTraceDiagnosticsFromAttachments,
} from "./internal/traceDiagnostics";
import type {
  ConsoleEntry,
  GlobalError,
  LlmReporterOptions,
  LlmTestEntry,
  LlmTestReport,
  NetworkReport,
  TestSummary,
} from "./types";

function emptyNetworkReport(): NetworkReport {
  return {
    summary: {
      observedInstances: 0,
      retainedInstances: 0,
      retainedGroups: 0,
      retainedBodies: 0,
      instancesDroppedByFilter: 0,
      instancesDroppedByGroupCap: 0,
      instancesDroppedByInstanceCap: 0,
      instancesSuppressedAsDuplicate: 0,
      instancesEvictedAfterAdmission: 0,
      bodiesOmittedByBodyCap: 0,
      bodiesTruncated: 0,
      bodiesCanonicalized: 0,
    },
    instances: [],
    groups: {},
    bodies: {},
  };
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
    const { config } = this;
    if (!config) {
      return;
    }

    const file = path.relative(config.rootDir, test.location.file);
    const fullTitle = buildFullTitle(test);
    const project = test.parent.project()?.name ?? "";
    const { status } = result;
    const retries = test.results.length - 1;
    const isFlaky = status === "passed" && retries > 0;

    process.stdout.write(statusIndicator(status));

    const outputDirectory = test.parent.project()?.outputDir ?? config.rootDir;
    const { attachments, tracePaths } = collectAttachments(result, outputDirectory);
    const errors = result.errors.map(buildTestError);
    const attemptStartTimeMs = result.startTime.getTime();

    let network: NetworkReport;
    let consoleMessages: ConsoleEntry[];
    try {
      const traceDiagnostics = collectTraceDiagnosticsFromAttachments(
        tracePaths,
        attemptStartTimeMs,
      );
      ({ network, consoleMessages } = traceDiagnostics);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const globalError: GlobalError = {
        message: `LlmReporter: trace diagnostics failed for test ${test.id}: ${message}`,
      };
      if (error instanceof Error && error.stack) {
        globalError.stack = error.stack;
      }
      this.globalErrors.push(globalError);
      network = emptyNetworkReport();
      consoleMessages = [];
    }

    const attemptResult = buildAttemptResult({
      result,
      errors,
      attachments,
      network,
      consoleMessages,
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
    const { config } = this;
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
        summary.flaky += 1;
      } else {
        summary[entry.status] += 1;
      }
    }

    const report: LlmTestReport = {
      schemaVersion: 3,
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
