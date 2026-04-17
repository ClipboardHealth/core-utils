import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import type {
  FullConfig,
  FullResult,
  Suite,
  TestCase,
  TestResult,
  TestStep,
} from "@playwright/test/reporter";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { writeTraceZipFixture } from "./internal/testHelpers";
import LlmReporter from "./reporter";
import type { AttemptResult, LlmTestEntry, LlmTestReport } from "./types";

const NETWORK_REQUESTS_CAP = 200 as const;

function createMockConfig(overrides: Partial<FullConfig> = {}): FullConfig {
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
  return {
    rootDir: "/project",
    version: "1.52.0",
    workers: 4,
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
    projects: [{ name: "chromium", retries: 2 } as FullConfig["projects"][0]],
    ...overrides,
  } as FullConfig;
}

function createMockSuite(): Suite {
  return {
    title: "",
    parent: undefined,
    allTests: () => [],
    entries: () => [],
    suites: [],
    tests: [],
    titlePath: () => [],
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    project: () => {},
    type: "root",
  } as unknown as Suite;
}

interface MockTestCaseOptions {
  outputDirectory?: string;
  projectName?: string;
}

function createMockTestCase(
  overrides: Partial<TestCase> = {},
  options: MockTestCaseOptions = {},
): TestCase {
  const mockProject = {
    name: options.projectName ?? "chromium",
    outputDir: options.outputDirectory ?? "/project/test-results",
  };
  const rootSuite = { title: "", parent: undefined, type: "root" };
  const projectSuite = {
    title: mockProject.name,
    parent: rootSuite,
    project: () => mockProject,
    type: "project",
  };
  const fileSuite = {
    title: "my-test.spec.ts",
    parent: projectSuite,
    project: () => mockProject,
    type: "file",
  };
  return {
    id: "stable-test-id-1",
    title: "should pass",
    location: { file: "/project/tests/my-test.spec.ts", line: 10, column: 5 },
    tags: ["@smoke"],
    annotations: [],
    results: [{}],
    parent: {
      title: "Suite",
      parent: fileSuite,
      project: () => mockProject,
      type: "describe",
    },
    ...overrides,
  } as unknown as TestCase;
}

function createMockStep(overrides: Partial<TestStep> = {}): TestStep {
  return {
    title: "step",
    category: "test.step",
    duration: 25,
    startTime: new Date(),
    steps: [],
    ...overrides,
  } as unknown as TestStep;
}

function createMockResult(overrides: Partial<TestResult> = {}): TestResult {
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
  return {
    status: "passed",
    duration: 150,
    errors: [],
    attachments: [],
    stdout: [],
    stderr: [],
    retry: 0,
    workerIndex: 0,
    parallelIndex: 0,
    startTime: new Date(),
    steps: [],
    ...overrides,
  } as TestResult;
}

function readReport(filePath: string): LlmTestReport {
  // eslint-disable-next-line security/detect-non-literal-fs-filename
  return JSON.parse(readFileSync(filePath, "utf8")) as LlmTestReport;
}

function firstTestEntry(report: LlmTestReport): LlmTestEntry {
  return report.tests[0]!;
}

function firstAttempt(report: LlmTestReport): AttemptResult {
  return firstTestEntry(report).attempts[0]!;
}

describe(LlmReporter, () => {
  let outputDirectory: string;
  let outputFile: string;

  beforeEach(() => {
    outputDirectory = mkdtempSync(path.join(tmpdir(), "llm-reporter-test-"));
    outputFile = path.join(outputDirectory, "llm-report.json");
    vi.spyOn(process.stdout, "write").mockReturnValue(true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    rmSync(outputDirectory, { recursive: true, force: true });
  });

  it("deletes stale report on begin", () => {
    // eslint-disable-next-line security/detect-non-literal-fs-filename
    writeFileSync(outputFile, "stale");

    const reporter = new LlmReporter({ outputFile });
    reporter.onBegin(createMockConfig(), createMockSuite());

    // eslint-disable-next-line security/detect-non-literal-fs-filename
    expect(existsSync(outputFile)).toBe(false);
  });

  it("writes a valid JSON report for a passing test", () => {
    const reporter = new LlmReporter({ outputFile });
    const config = createMockConfig();

    reporter.onBegin(config, createMockSuite());
    reporter.onTestEnd(createMockTestCase(), createMockResult());
    reporter.onEnd({ status: "passed" } as FullResult);

    const report = readReport(outputFile);

    expect(report.schemaVersion).toBe(2);
    expect(report.timestamp).toBeDefined();
    expect(report.durationMs).toBeGreaterThanOrEqual(0);
    expect(report.summary).toStrictEqual({
      total: 1,
      passed: 1,
      failed: 0,
      flaky: 0,
      skipped: 0,
      timedOut: 0,
      interrupted: 0,
    });
    expect(report.environment.playwrightVersion).toBe("1.52.0");
    expect(report.environment.nodeVersion).toBe(process.version);
    expect(report.environment.workers).toBe(4);
    expect(report.tests).toHaveLength(1);
    expect(report.tests[0]?.status).toBe("passed");
    expect(report.tests[0]?.flaky).toBe(false);
    expect(report.tests[0]?.id).toBe("stable-test-id-1");
    expect(report.globalErrors).toStrictEqual([]);
  });

  it("records failed tests with error details", () => {
    const reporter = new LlmReporter({ outputFile });
    reporter.onBegin(createMockConfig(), createMockSuite());

    const result = createMockResult({
      status: "failed",
      errors: [
        {
          message: "\u001B[31mExpected: 1\u001B[39m\n\u001B[31mReceived: 2\u001B[39m",
          stack:
            "Error: expect\n    at /project/tests/my-test.spec.ts:12:5\n    at node_modules/playwright/runner.js:100:10",
          location: { file: "/project/tests/my-test.spec.ts", line: 12, column: 5 },
        },
      ],
    });

    reporter.onTestEnd(createMockTestCase(), result);
    reporter.onEnd({ status: "failed" } as FullResult);

    const report = readReport(outputFile);

    expect(report.summary.failed).toBe(1);
    expect(report.tests[0]?.errors).toHaveLength(1);
    expect(report.tests[0]?.errors[0]?.message).not.toContain("\u001B[");
    expect(report.tests[0]?.errors[0]?.stack).not.toContain("node_modules");
    expect(report.tests[0]?.errors[0]?.location).toStrictEqual({
      file: "/project/tests/my-test.spec.ts",
      line: 12,
      column: 5,
    });
  });

  it("preserves all retry attempts per test while keeping final-attempt semantics", () => {
    const reporter = new LlmReporter({ outputFile });
    reporter.onBegin(createMockConfig(), createMockSuite());

    const finalAttemptTestCase = createMockTestCase({
      id: "flaky-test-id",
      results: [{}, {}] as TestResult[],
    });

    const failedAttemptTestCase = createMockTestCase({
      id: "flaky-test-id",
      results: [{}] as TestResult[],
    });
    reporter.onTestEnd(
      failedAttemptTestCase,
      createMockResult({
        status: "failed",
        retry: 0,
        startTime: new Date("2026-02-25T10:00:00.000Z"),
        duration: 111,
        errors: [{ message: "first attempt failed" }],
      }),
    );

    reporter.onTestEnd(
      finalAttemptTestCase,
      createMockResult({
        status: "passed",
        retry: 1,
        startTime: new Date("2026-02-25T10:00:01.000Z"),
        duration: 222,
        stdout: ["final stdout"],
      }),
    );
    reporter.onEnd({ status: "passed" } as FullResult);

    const report = readReport(outputFile);
    const entry = firstTestEntry(report);

    expect(report.tests).toHaveLength(1);
    expect(report.summary.total).toBe(1);
    expect(entry.attempts).toHaveLength(2);
    expect(entry.attempts[0]).toMatchObject({
      attempt: 1,
      status: "failed",
      durationMs: 111,
      workerIndex: 0,
      parallelIndex: 0,
    });
    expect(entry.attempts[1]).toMatchObject({
      attempt: 2,
      status: "passed",
      durationMs: 222,
    });
    expect(entry.flaky).toBe(true);
    expect(entry.retries).toBe(1);
    expect(entry.status).toBe("passed");
    expect(entry.stdout).toBe("final stdout");
    expect(entry.error).toBeUndefined();
    expect(report.summary.flaky).toBe(1);
    expect(report.summary.passed).toBe(0);
    expect(report.summary.failed).toBe(0);
  });

  it("preserves repeatEach runs as distinct entries", () => {
    const reporter = new LlmReporter({ outputFile });
    reporter.onBegin(createMockConfig(), createMockSuite());

    // repeatEach produces distinct test.id values for the same test title
    const run1 = createMockTestCase({ id: "repeat-run-1" });
    const run2 = createMockTestCase({ id: "repeat-run-2" });

    reporter.onTestEnd(run1, createMockResult());
    reporter.onTestEnd(run2, createMockResult());
    reporter.onEnd({ status: "passed" } as FullResult);

    const report = readReport(outputFile);

    expect(report.tests).toHaveLength(2);
    expect(report.summary.total).toBe(2);
    expect(report.summary.passed).toBe(2);
  });

  it("builds full title from describe suites only", () => {
    const reporter = new LlmReporter({ outputFile });
    reporter.onBegin(createMockConfig(), createMockSuite());

    const testCase = createMockTestCase();
    reporter.onTestEnd(testCase, createMockResult());
    reporter.onEnd({ status: "passed" } as FullResult);

    const report = readReport(outputFile);

    expect(report.tests[0]?.title).toBe("Suite > should pass");
  });

  it("caps stdout/stderr at 4KB", () => {
    const reporter = new LlmReporter({ outputFile });
    reporter.onBegin(createMockConfig(), createMockSuite());

    const longOutput = "x".repeat(5000);
    const result = createMockResult({
      stdout: [longOutput],
      stderr: [longOutput],
    });

    reporter.onTestEnd(createMockTestCase(), result);
    reporter.onEnd({ status: "passed" } as FullResult);

    const report = readReport(outputFile);

    expect(report.tests[0]?.stdout.length).toBeLessThanOrEqual(4096);
    expect(report.tests[0]?.stdout).toContain("[truncated]");
    expect(report.tests[0]?.stderr.length).toBeLessThanOrEqual(4096);
    expect(report.tests[0]?.stderr).toContain("[truncated]");
  });

  it("extracts network requests and JSON bodies from trace attachments", () => {
    const reporter = new LlmReporter({ outputFile });
    reporter.onBegin(createMockConfig(), createMockSuite());

    const attemptStart = new Date("2026-01-01T00:00:00.000Z");
    const tracePath = writeTraceZipFixture(outputDirectory, "trace-with-network.zip", {
      requestBody: JSON.stringify({ request: "hello" }),
      responseBody: JSON.stringify({ response: "world" }),
      contextOptions: { wallTimeMs: 1_767_225_600_000, monotonicTimeMs: 5000 },
      networkEvents: [
        {
          type: "resource-snapshot",
          snapshot: {
            time: 37,
            _monotonicTime: 5500,
            _resourceType: "fetch",
            request: {
              method: "POST",
              url: "https://api.example.com/v1/orders",
              postData: { mimeType: "application/json", _sha1: "request-body.json" },
            },
            response: {
              status: 201,
              content: { mimeType: "application/json", _sha1: "response-body.json" },
            },
            timings: { send: 10, wait: 20, receive: 7 },
          },
        },
      ],
    });
    const result = createMockResult({
      startTime: attemptStart,
      attachments: [{ name: "trace", contentType: "application/zip", path: tracePath }],
    });

    reporter.onTestEnd(createMockTestCase({}, { outputDirectory }), result);
    reporter.onEnd({ status: "passed" } as FullResult);

    const report = readReport(outputFile);
    const entry = firstTestEntry(report);
    const [attempt] = entry.attempts;

    expect(attempt?.network).toStrictEqual([
      {
        method: "POST",
        url: "https://api.example.com/v1/orders",
        status: 201,
        durationMs: 37,
        offsetMs: 500,
        resourceType: "fetch",
        timings: {
          sendMs: 10,
          waitMs: 20,
          receiveMs: 7,
        },
        requestBody: '{"request":"hello"}',
        responseBody: '{"response":"world"}',
      },
    ]);
    expect(entry.network).toStrictEqual(attempt?.network);
  });

  it("keeps network empty when no trace attachment exists", () => {
    const reporter = new LlmReporter({ outputFile });
    reporter.onBegin(createMockConfig(), createMockSuite());

    reporter.onTestEnd(
      createMockTestCase(),
      createMockResult({
        attachments: [
          { name: "screenshot", contentType: "image/png", path: "/project/tmp/screenshot.png" },
        ],
      }),
    );
    reporter.onEnd({ status: "passed" } as FullResult);

    const report = readReport(outputFile);
    const entry = firstTestEntry(report);

    expect(entry.attempts[0]?.network).toStrictEqual([]);
    expect(entry.network).toStrictEqual([]);
  });

  it("collects global errors", () => {
    const reporter = new LlmReporter({ outputFile });
    reporter.onBegin(createMockConfig(), createMockSuite());

    reporter.onError({
      message: "Global config error",
      stack: "Error: Global config error\n    at /project/playwright.config.ts:5:1",
    });

    reporter.onTestEnd(createMockTestCase(), createMockResult());
    reporter.onEnd({ status: "failed" } as FullResult);

    const report = readReport(outputFile);

    expect(report.globalErrors).toHaveLength(1);
    expect(report.globalErrors[0]?.message).toBe("Global config error");
  });

  it("handles attachments with relative paths", () => {
    const reporter = new LlmReporter({ outputFile });
    reporter.onBegin(createMockConfig(), createMockSuite());

    const result = createMockResult({
      attachments: [
        {
          name: "screenshot",
          contentType: "image/png",
          path: "/project/test-results/screenshot.png",
        },
      ],
    });

    reporter.onTestEnd(createMockTestCase(), result);
    reporter.onEnd({ status: "passed" } as FullResult);

    const report = readReport(outputFile);

    expect(report.tests[0]?.attachments).toHaveLength(1);
    expect(report.tests[0]?.attachments[0]?.path).toBe("screenshot.png");
    expect(report.tests[0]?.attachments[0]?.name).toBe("screenshot");
  });

  it("prints dot progress and summary to stdout", () => {
    const mockWrite = vi.mocked(process.stdout.write);
    const reporter = new LlmReporter({ outputFile });
    reporter.onBegin(createMockConfig(), createMockSuite());

    reporter.onTestEnd(createMockTestCase(), createMockResult());
    reporter.onTestEnd(
      createMockTestCase({ id: "test-id-2", title: "should fail" }),
      createMockResult({ status: "failed", errors: [] }),
    );
    reporter.onEnd({ status: "failed" } as FullResult);

    const output = mockWrite.mock.calls.map((call) => call[0]).join("");

    expect(output).toContain(".");
    expect(output).toContain("F");
    expect(output).toContain("2 tests");
    expect(output).toContain("Report:");
  });

  it("uses default outputFile when none provided", () => {
    const sandboxDirectory = mkdtempSync(path.join(tmpdir(), "llm-reporter-default-"));
    const originalCwd = process.cwd();
    process.chdir(sandboxDirectory);
    try {
      const reporter = new LlmReporter();
      reporter.onBegin(createMockConfig(), createMockSuite());
      reporter.onTestEnd(createMockTestCase(), createMockResult());
      reporter.onEnd({ status: "passed" } as FullResult);

      const report = readReport(path.join(sandboxDirectory, "test-results/llm-report.json"));

      expect(report.schemaVersion).toBe(2);
    } finally {
      process.chdir(originalCwd);
      rmSync(sandboxDirectory, { recursive: true, force: true });
    }
  });

  it("counts interrupted tests", () => {
    const reporter = new LlmReporter({ outputFile });
    reporter.onBegin(createMockConfig(), createMockSuite());

    reporter.onTestEnd(
      createMockTestCase(),
      createMockResult({ status: "interrupted" as TestResult["status"] }),
    );
    reporter.onEnd({ status: "interrupted" } as FullResult);

    const report = readReport(outputFile);

    expect(report.summary.interrupted).toBe(1);
    expect(report.summary.passed).toBe(0);
  });

  it("uses max retries across all projects", () => {
    const reporter = new LlmReporter({ outputFile });
    const config = createMockConfig({
      projects: [
        { name: "chromium", retries: 1 },
        { name: "firefox", retries: 3 },
      ] as FullConfig["projects"],
    });

    reporter.onBegin(config, createMockSuite());
    reporter.onTestEnd(createMockTestCase(), createMockResult());
    reporter.onEnd({ status: "passed" } as FullResult);

    const report = readReport(outputFile);

    expect(report.environment.retries).toBe(3);
  });

  it("includes flaky and timedOut in console output", () => {
    const mockWrite = vi.mocked(process.stdout.write);
    const reporter = new LlmReporter({ outputFile });
    reporter.onBegin(createMockConfig(), createMockSuite());

    const flakyTest = createMockTestCase({
      id: "flaky-1",
      results: [{}, {}] as TestResult[],
    });
    reporter.onTestEnd(flakyTest, createMockResult());

    reporter.onTestEnd(
      createMockTestCase({ id: "timeout-1" }),
      createMockResult({ status: "timedOut" as TestResult["status"] }),
    );

    reporter.onEnd({ status: "failed" } as FullResult);

    const output = mockWrite.mock.calls.map((call) => call[0]).join("");

    expect(output).toContain("1 flaky");
    expect(output).toContain("1 timedOut");
  });

  it("warns if onEnd called without onBegin", () => {
    const mockError = vi.spyOn(console, "error").mockImplementation(vi.fn());
    const reporter = new LlmReporter({ outputFile });

    reporter.onEnd({ status: "passed" } as FullResult);

    expect(mockError).toHaveBeenCalledWith(expect.stringContaining("onEnd called without onBegin"));
    mockError.mockRestore();
  });

  it("returns early if onTestEnd is called before onBegin", () => {
    const reporter = new LlmReporter({ outputFile });

    reporter.onTestEnd(createMockTestCase(), createMockResult());
    reporter.onEnd({ status: "passed" } as FullResult);

    // eslint-disable-next-line security/detect-non-literal-fs-filename
    expect(existsSync(outputFile)).toBe(false);
  });

  it("updates top-level error when the final attempt fails", () => {
    const reporter = new LlmReporter({ outputFile });
    reporter.onBegin(createMockConfig(), createMockSuite());

    reporter.onTestEnd(
      createMockTestCase({
        id: "retry-fail-id",
        results: [{}] as TestResult[],
      }),
      createMockResult({
        status: "passed",
        retry: 0,
      }),
    );
    reporter.onTestEnd(
      createMockTestCase({
        id: "retry-fail-id",
        results: [{}, {}] as TestResult[],
      }),
      createMockResult({
        status: "failed",
        retry: 1,
        errors: [
          {
            message: "final attempt failed",
            snippet: "console.log('snippet');",
          },
        ],
      }),
    );
    reporter.onEnd({ status: "failed" } as FullResult);

    const report = readReport(outputFile);
    const entry = firstTestEntry(report);

    expect(entry.status).toBe("failed");
    expect(entry.error?.message).toBe("final attempt failed");
    expect(entry.errors[0]?.snippet).toBe("console.log('snippet');");
    expect(entry.attempts).toHaveLength(2);
    expect(entry.attempts[1]?.error?.message).toBe("final attempt failed");
  });

  it("handles skipped tests in progress output and summary", () => {
    const reporter = new LlmReporter({ outputFile });
    const mockWrite = vi.mocked(process.stdout.write);
    reporter.onBegin(createMockConfig(), createMockSuite());

    reporter.onTestEnd(
      createMockTestCase({ id: "skipped-id" }),
      createMockResult({ status: "skipped" as TestResult["status"] }),
    );
    reporter.onEnd({ status: "passed" } as FullResult);

    const output = mockWrite.mock.calls.map((call) => call[0]).join("");
    const report = readReport(outputFile);

    expect(output).toContain("S");
    expect(report.summary.skipped).toBe(1);
  });

  it("logs an error when report writing throws", () => {
    const reporter = new LlmReporter({ outputFile });
    const mockError = vi.spyOn(console, "error").mockImplementation(vi.fn());
    const stringifySpy = vi.spyOn(JSON, "stringify").mockImplementation(() => {
      throw new Error("stringify failed");
    });

    try {
      reporter.onBegin(createMockConfig(), createMockSuite());
      reporter.onTestEnd(createMockTestCase(), createMockResult());
      reporter.onEnd({ status: "passed" } as FullResult);

      expect(mockError).toHaveBeenCalledWith(
        expect.stringContaining(`LlmReporter: Failed to write report to ${outputFile}`),
        expect.any(Error),
      );
    } finally {
      stringifySpy.mockRestore();
      mockError.mockRestore();
    }
  });

  it("resets state when onBegin is called again", () => {
    const reporter = new LlmReporter({ outputFile });
    const config = createMockConfig();

    // First run: 1 test + 1 global error
    reporter.onBegin(config, createMockSuite());
    reporter.onTestEnd(createMockTestCase(), createMockResult());
    reporter.onError({ message: "first run error" });
    reporter.onEnd({ status: "passed" } as FullResult);

    // Second run: 0 tests, 0 errors
    reporter.onBegin(config, createMockSuite());
    reporter.onEnd({ status: "passed" } as FullResult);

    const report = readReport(outputFile);

    expect(report.tests).toHaveLength(0);
    expect(report.summary.total).toBe(0);
    expect(report.globalErrors).toHaveLength(0);
  });

  it("wires trace diagnostics through to attempt results", () => {
    const reporter = new LlmReporter({ outputFile });
    reporter.onBegin(createMockConfig(), createMockSuite());

    const attemptStart = new Date("2026-01-01T00:00:00.000Z");
    const tracePath = writeTraceZipFixture(outputDirectory, "trace-wiring.zip", {
      requestBody: JSON.stringify({ request: "hello" }),
      responseBody: JSON.stringify({ response: "world" }),
      contextOptions: { wallTimeMs: 1_767_225_600_000, monotonicTimeMs: 1000 },
      networkEvents: [
        {
          type: "resource-snapshot",
          snapshot: {
            _monotonicTime: 1200,
            _resourceType: "fetch",
            request: { method: "GET", url: "https://api.example.com/timeline" },
            response: { status: 200 },
            timings: { send: 1, wait: 10, receive: 2 },
          },
        },
      ],
      traceEvents: [{ type: "console", messageType: "error", text: "timeline error", time: 1300 }],
    });

    const result = createMockResult({
      startTime: attemptStart,
      steps: [
        createMockStep({
          title: "timeline step",
          startTime: new Date("2026-01-01T00:00:00.100Z"),
          duration: 50,
        }),
      ],
      attachments: [{ name: "trace", contentType: "application/zip", path: tracePath }],
    });

    reporter.onTestEnd(createMockTestCase({}, { outputDirectory }), result);
    reporter.onEnd({ status: "passed" } as FullResult);

    const report = readReport(outputFile);
    const attempt = firstAttempt(report);

    expect(attempt.timeline).toHaveLength(3);
    expect(attempt.timeline[0]).toMatchObject({ kind: "step", offsetMs: 100 });
    expect(attempt.timeline[1]).toMatchObject({ kind: "network", offsetMs: 200 });
    expect(attempt.timeline[2]).toMatchObject({ kind: "console", offsetMs: 300 });

    const entry = firstTestEntry(report);
    expect(entry.timeline).toStrictEqual(attempt.timeline);
  });

  it("keeps improving console signal after network cap is reached", () => {
    const reporter = new LlmReporter({ outputFile });
    reporter.onBegin(createMockConfig(), createMockSuite());

    const traceEvents = [
      ...Array.from({ length: 50 }, (_, index) => ({
        type: "event",
        method: "pageClosed",
        params: { pageId: `page-${index}` },
      })),
      { type: "console", messageType: "error", text: "error retained after network cap" },
    ];
    const networkEvents = Array.from({ length: NETWORK_REQUESTS_CAP + 10 }, (_, index) => ({
      type: "resource-snapshot",
      snapshot: {
        _resourceType: "fetch",
        request: {
          method: "GET",
          url: `https://api.example.com/network-cap/${index}`,
        },
        response: {
          status: 200,
        },
      },
    }));
    const tracePath = writeTraceZipFixture(
      outputDirectory,
      "trace-console-priority-network-cap.zip",
      {
        requestBody: JSON.stringify({ request: "hello" }),
        responseBody: JSON.stringify({ response: "world" }),
        traceEvents,
        networkEvents,
      },
    );

    reporter.onTestEnd(
      createMockTestCase({}, { outputDirectory }),
      createMockResult({
        attachments: [{ name: "trace", contentType: "application/zip", path: tracePath }],
      }),
    );
    reporter.onEnd({ status: "passed" } as FullResult);

    const report = readReport(outputFile);
    const attempt = firstAttempt(report);

    expect(attempt.network).toHaveLength(NETWORK_REQUESTS_CAP);
    expect(attempt.consoleMessages).toContainEqual({
      type: "error",
      text: "error retained after network cap",
    });
  });
});
