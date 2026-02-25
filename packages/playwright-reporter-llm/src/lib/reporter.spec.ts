import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import type {
  FullConfig,
  FullResult,
  Suite,
  TestCase,
  TestResult,
} from "@playwright/test/reporter";

import LlmReporter from "./reporter";
import type { LlmTestReport } from "./types";

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

function createMockTestCase(overrides: Partial<TestCase> = {}): TestCase {
  const mockProject = { name: "chromium", outputDir: "/project/test-results" };
  const rootSuite = { title: "", parent: undefined, type: "root" };
  const projectSuite = {
    title: "chromium",
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

describe("LlmReporter", () => {
  let outputDirectory: string;
  let outputFile: string;

  beforeEach(() => {
    outputDirectory = mkdtempSync(path.join(tmpdir(), "llm-reporter-test-"));
    outputFile = path.join(outputDirectory, "llm-report.json");
    jest.spyOn(process.stdout, "write").mockImplementation(() => true);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    rmSync(outputDirectory, { recursive: true, force: true });
  });

  it("deletes stale report on begin", () => {
    // eslint-disable-next-line security/detect-non-literal-fs-filename
    mkdirSync(outputDirectory, { recursive: true });
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

    expect(report.schemaVersion).toBe(1);
    expect(report.timestamp).toBeDefined();
    expect(report.durationMs).toBeGreaterThanOrEqual(0);
    expect(report.summary).toEqual({
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
    expect(report.globalErrors).toEqual([]);
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
    expect(report.tests[0]?.errors[0]?.location).toEqual({
      file: "/project/tests/my-test.spec.ts",
      line: 12,
      column: 5,
    });
  });

  it("deduplicates retries — keeps only final result per test", () => {
    const reporter = new LlmReporter({ outputFile });
    reporter.onBegin(createMockConfig(), createMockSuite());

    const testCase = createMockTestCase({
      results: [{}, {}] as TestResult[],
    });

    // First attempt: fails (results.length=1 at that point, simulated by different testCase state)
    const failedAttemptTestCase = createMockTestCase({ results: [{}] as TestResult[] });
    reporter.onTestEnd(
      failedAttemptTestCase,
      createMockResult({ status: "failed", errors: [{ message: "fail" }] }),
    );

    // Second attempt: passes (results.length=2, so retries=1, flaky=true)
    reporter.onTestEnd(testCase, createMockResult({ status: "passed" }));
    reporter.onEnd({ status: "passed" } as FullResult);

    const report = readReport(outputFile);

    expect(report.tests).toHaveLength(1);
    expect(report.summary.total).toBe(1);
    expect(report.tests[0]?.flaky).toBe(true);
    expect(report.tests[0]?.retries).toBe(1);
    expect(report.tests[0]?.status).toBe("passed");
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
    const mockWrite = jest.mocked(process.stdout.write);
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

  it("extracts diff from assertion errors", () => {
    const reporter = new LlmReporter({ outputFile });
    reporter.onBegin(createMockConfig(), createMockSuite());

    const result = createMockResult({
      status: "failed",
      errors: [
        {
          message: 'Expected: "hello"\nReceived: "world"',
        },
      ],
    });

    reporter.onTestEnd(createMockTestCase(), result);
    reporter.onEnd({ status: "failed" } as FullResult);

    const report = readReport(outputFile);

    expect(report.tests[0]?.errors[0]?.diff).toEqual({
      expected: '"hello"',
      actual: '"world"',
    });
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

      expect(report.schemaVersion).toBe(1);
    } finally {
      process.chdir(originalCwd);
      rmSync(sandboxDirectory, { recursive: true, force: true });
    }
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
    const mockWrite = jest.mocked(process.stdout.write);
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
    const mockError = jest.spyOn(console, "error").mockImplementation(jest.fn());
    const reporter = new LlmReporter({ outputFile });

    reporter.onEnd({ status: "passed" } as FullResult);

    expect(mockError).toHaveBeenCalledWith(expect.stringContaining("onEnd called without onBegin"));
    mockError.mockRestore();
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
});
