import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { deflateRawSync } from "node:zlib";

import type {
  FullConfig,
  FullResult,
  Suite,
  TestCase,
  TestResult,
  TestStep,
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

interface ReportTestAttempt {
  attempt: number;
  status: TestResult["status"];
  durationMs: number;
  startTime: string;
  workerIndex: number;
  parallelIndex: number;
  error?: { message: string };
  steps: Array<{
    title: string;
    category: string;
    durationMs: number;
    depth: number;
    error?: string;
  }>;
  network: Array<{
    method: string;
    url: string;
    status: number;
    durationMs?: number;
    resourceType?: string;
    requestBody?: string;
    responseBody?: string;
  }>;
  consoleMessages: Array<{
    type: string;
    text: string;
  }>;
}

type ReportTestWithAttempts = LlmTestReport["tests"][number] & {
  attempts: ReportTestAttempt[];
  error?: { message: string };
  steps?: ReportTestAttempt["steps"];
  network?: ReportTestAttempt["network"];
};

interface ZipFixtureEntry {
  fileName: string;
  content: string | Buffer;
  compressionMethod?: 0 | 8;
}

function createStoredZipArchive(entries: ZipFixtureEntry[]): Buffer {
  const localFileParts: Buffer[] = [];
  const centralDirectoryParts: Buffer[] = [];
  let localFileOffset = 0;

  for (const entry of entries) {
    const fileName = Buffer.from(entry.fileName, "utf8");
    const fileContent = Buffer.isBuffer(entry.content)
      ? entry.content
      : Buffer.from(entry.content, "utf8");
    const compressionMethod = entry.compressionMethod ?? 0;
    const compressedContent =
      compressionMethod === 8 ? deflateRawSync(fileContent) : Buffer.from(fileContent);

    const localFileHeader = Buffer.alloc(30);
    localFileHeader.writeUInt32LE(67_324_752, 0);
    localFileHeader.writeUInt16LE(20, 4);
    localFileHeader.writeUInt16LE(0, 6);
    localFileHeader.writeUInt16LE(compressionMethod, 8);
    localFileHeader.writeUInt16LE(0, 10);
    localFileHeader.writeUInt16LE(0, 12);
    localFileHeader.writeUInt32LE(0, 14);
    localFileHeader.writeUInt32LE(compressedContent.length, 18);
    localFileHeader.writeUInt32LE(fileContent.length, 22);
    localFileHeader.writeUInt16LE(fileName.length, 26);
    localFileHeader.writeUInt16LE(0, 28);

    localFileParts.push(localFileHeader, fileName, compressedContent);

    const centralDirectoryHeader = Buffer.alloc(46);
    centralDirectoryHeader.writeUInt32LE(33_639_248, 0);
    centralDirectoryHeader.writeUInt16LE(20, 4);
    centralDirectoryHeader.writeUInt16LE(20, 6);
    centralDirectoryHeader.writeUInt16LE(0, 8);
    centralDirectoryHeader.writeUInt16LE(compressionMethod, 10);
    centralDirectoryHeader.writeUInt16LE(0, 12);
    centralDirectoryHeader.writeUInt16LE(0, 14);
    centralDirectoryHeader.writeUInt32LE(0, 16);
    centralDirectoryHeader.writeUInt32LE(compressedContent.length, 20);
    centralDirectoryHeader.writeUInt32LE(fileContent.length, 24);
    centralDirectoryHeader.writeUInt16LE(fileName.length, 28);
    centralDirectoryHeader.writeUInt16LE(0, 30);
    centralDirectoryHeader.writeUInt16LE(0, 32);
    centralDirectoryHeader.writeUInt16LE(0, 34);
    centralDirectoryHeader.writeUInt16LE(0, 36);
    centralDirectoryHeader.writeUInt32LE(0, 38);
    centralDirectoryHeader.writeUInt32LE(localFileOffset, 42);

    centralDirectoryParts.push(centralDirectoryHeader, fileName);

    localFileOffset += localFileHeader.length + fileName.length + compressedContent.length;
  }

  const centralDirectory = Buffer.concat(centralDirectoryParts);
  const endOfCentralDirectoryRecord = Buffer.alloc(22);
  endOfCentralDirectoryRecord.writeUInt32LE(101_010_256, 0);
  endOfCentralDirectoryRecord.writeUInt16LE(0, 4);
  endOfCentralDirectoryRecord.writeUInt16LE(0, 6);
  endOfCentralDirectoryRecord.writeUInt16LE(entries.length, 8);
  endOfCentralDirectoryRecord.writeUInt16LE(entries.length, 10);
  endOfCentralDirectoryRecord.writeUInt32LE(centralDirectory.length, 12);
  endOfCentralDirectoryRecord.writeUInt32LE(localFileOffset, 16);
  endOfCentralDirectoryRecord.writeUInt16LE(0, 20);

  return Buffer.concat([...localFileParts, centralDirectory, endOfCentralDirectoryRecord]);
}

interface WriteTraceZipFixtureInput {
  requestBody: string;
  responseBody: string;
  traceEvents?: unknown[];
  traceRawLines?: string[];
  useDeflateCompression?: boolean;
}

function writeTraceZipFixture(
  fixtureDirectory: string,
  fileName: string,
  input: WriteTraceZipFixtureInput,
): string {
  const {
    requestBody,
    responseBody,
    traceEvents = [],
    traceRawLines = [],
    useDeflateCompression = false,
  } = input;
  const traceLines = [...traceEvents.map((event) => JSON.stringify(event)), ...traceRawLines];
  const entryCompressionMethod = useDeflateCompression ? 8 : 0;

  const archive = createStoredZipArchive([
    {
      fileName: "test.trace",
      content: `${traceLines.join("\n")}${traceLines.length > 0 ? "\n" : ""}`,
      compressionMethod: entryCompressionMethod,
    },
    {
      fileName: "test.network",
      content: `${JSON.stringify({
        type: "resource-snapshot",
        snapshot: {
          time: 37,
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
        },
      })}\n`,
      compressionMethod: entryCompressionMethod,
    },
    {
      fileName: "resources/request-body.json",
      content: requestBody,
      compressionMethod: entryCompressionMethod,
    },
    {
      fileName: "resources/response-body.json",
      content: responseBody,
      compressionMethod: entryCompressionMethod,
    },
  ]);

  const tracePath = path.join(fixtureDirectory, fileName);
  // eslint-disable-next-line security/detect-non-literal-fs-filename
  writeFileSync(tracePath, archive);
  return tracePath;
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
    const entry = report.tests[0] as ReportTestWithAttempts;

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

  it("flattens nested steps with depth and first-line errors", () => {
    const reporter = new LlmReporter({ outputFile });
    reporter.onBegin(createMockConfig(), createMockSuite());

    const result = createMockResult({
      steps: [
        createMockStep({
          title: "outer step",
          category: "test.step",
          duration: 40,
          steps: [
            createMockStep({
              title: "inner step",
              category: "pw:api",
              duration: 20,
              error: { message: "inner failure line\nstack line 1\nstack line 2" },
            }),
          ],
        }),
      ],
    });

    reporter.onTestEnd(createMockTestCase(), result);
    reporter.onEnd({ status: "failed" } as FullResult);

    const report = readReport(outputFile);
    const entry = report.tests[0] as ReportTestWithAttempts;
    const [attempt] = entry.attempts;

    expect(attempt?.steps).toEqual([
      {
        title: "outer step",
        category: "test.step",
        durationMs: 40,
        depth: 0,
      },
      {
        title: "inner step",
        category: "pw:api",
        durationMs: 20,
        depth: 1,
        error: "inner failure line",
      },
    ]);
    expect(entry.steps).toEqual(attempt?.steps);
  });

  it("extracts network requests and JSON bodies from trace attachments", () => {
    const reporter = new LlmReporter({ outputFile });
    reporter.onBegin(createMockConfig(), createMockSuite());

    const tracePath = writeTraceZipFixture(outputDirectory, "trace-with-network.zip", {
      requestBody: JSON.stringify({ request: "hello" }),
      responseBody: JSON.stringify({ response: "world" }),
    });
    const result = createMockResult({
      attachments: [{ name: "trace", contentType: "application/zip", path: tracePath }],
    });

    reporter.onTestEnd(createMockTestCase({}, { outputDirectory }), result);
    reporter.onEnd({ status: "passed" } as FullResult);

    const report = readReport(outputFile);
    const entry = report.tests[0] as ReportTestWithAttempts;
    const [attempt] = entry.attempts;

    expect(attempt?.network).toEqual([
      {
        method: "POST",
        url: "https://api.example.com/v1/orders",
        status: 201,
        durationMs: 37,
        resourceType: "fetch",
        requestBody: '{"request":"hello"}',
        responseBody: '{"response":"world"}',
      },
    ]);
    expect(entry.network).toEqual(attempt?.network);
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
    const entry = report.tests[0] as ReportTestWithAttempts;

    expect(entry.attempts[0]?.network).toEqual([]);
    expect(entry.network).toEqual([]);
  });

  it("caps JSON request and response bodies from traces at 2KB", () => {
    const reporter = new LlmReporter({ outputFile });
    reporter.onBegin(createMockConfig(), createMockSuite());

    const largeRequestBody = JSON.stringify({ payload: "x".repeat(5000) });
    const largeResponseBody = JSON.stringify({ payload: "y".repeat(5000) });
    const tracePath = writeTraceZipFixture(outputDirectory, "trace-with-large-bodies.zip", {
      requestBody: largeRequestBody,
      responseBody: largeResponseBody,
    });

    reporter.onTestEnd(
      createMockTestCase({}, { outputDirectory }),
      createMockResult({
        attachments: [{ name: "trace", contentType: "application/zip", path: tracePath }],
      }),
    );
    reporter.onEnd({ status: "passed" } as FullResult);

    const report = readReport(outputFile);
    const [attempt] = (report.tests[0] as ReportTestWithAttempts).attempts;

    expect(attempt?.network[0]?.requestBody).toBe(largeRequestBody.slice(0, 2048));
    expect(attempt?.network[0]?.responseBody).toBe(largeResponseBody.slice(0, 2048));
    expect(attempt?.network[0]?.requestBody).toHaveLength(2048);
    expect(attempt?.network[0]?.responseBody).toHaveLength(2048);
  });

  it("extracts warning/error/pageerror console messages from traces", () => {
    const reporter = new LlmReporter({ outputFile });
    reporter.onBegin(createMockConfig(), createMockSuite());

    const tracePath = writeTraceZipFixture(outputDirectory, "trace-with-console-events.zip", {
      requestBody: JSON.stringify({ request: "hello" }),
      responseBody: JSON.stringify({ response: "world" }),
      traceEvents: [
        { type: "console", messageType: "warning", text: "deprecated API used" },
        { type: "console", messageType: "error", text: "failed to fetch" },
        { type: "console", messageType: "log", text: "ignore this log" },
        { type: "console", messageType: "info", text: "ignore this info" },
        {
          type: "event",
          method: "pageError",
          params: { error: { message: "Uncaught TypeError: x is undefined" } },
        },
      ],
    });

    reporter.onTestEnd(
      createMockTestCase({}, { outputDirectory }),
      createMockResult({
        attachments: [{ name: "trace", contentType: "application/zip", path: tracePath }],
      }),
    );
    reporter.onEnd({ status: "passed" } as FullResult);

    const report = readReport(outputFile);
    const [attempt] = (report.tests[0] as ReportTestWithAttempts).attempts;

    expect(attempt?.consoleMessages).toEqual([
      { type: "warning", text: "deprecated API used" },
      { type: "error", text: "failed to fetch" },
      { type: "pageerror", text: "Uncaught TypeError: x is undefined" },
    ]);
  });

  it("caps console message text at 2KB and console message count at 50", () => {
    const reporter = new LlmReporter({ outputFile });
    reporter.onBegin(createMockConfig(), createMockSuite());

    const largeConsoleText = "x".repeat(5000);
    const consoleEvents = Array.from({ length: 60 }, (_, index) => ({
      type: "console",
      messageType: "error",
      text: `${index}-${largeConsoleText}`,
    }));
    const tracePath = writeTraceZipFixture(outputDirectory, "trace-with-many-console-events.zip", {
      requestBody: JSON.stringify({ request: "hello" }),
      responseBody: JSON.stringify({ response: "world" }),
      traceEvents: consoleEvents,
    });

    reporter.onTestEnd(
      createMockTestCase({}, { outputDirectory }),
      createMockResult({
        attachments: [{ name: "trace", contentType: "application/zip", path: tracePath }],
      }),
    );
    reporter.onEnd({ status: "passed" } as FullResult);

    const report = readReport(outputFile);
    const [attempt] = (report.tests[0] as ReportTestWithAttempts).attempts;

    expect(attempt?.consoleMessages).toHaveLength(50);
    expect(attempt?.consoleMessages[0]?.type).toBe("error");
    expect(attempt?.consoleMessages[0]?.text).toBe(`0-${largeConsoleText}`.slice(0, 2048));
    expect(attempt?.consoleMessages[0]?.text).toHaveLength(2048);
  });

  it("caps console messages across multiple trace attachments", () => {
    const reporter = new LlmReporter({ outputFile });
    reporter.onBegin(createMockConfig(), createMockSuite());

    const firstTracePath = writeTraceZipFixture(outputDirectory, "trace-console-cap-first.zip", {
      requestBody: JSON.stringify({ request: "hello" }),
      responseBody: JSON.stringify({ response: "world" }),
      traceEvents: Array.from({ length: 60 }, (_, index) => ({
        type: "console",
        messageType: "error",
        text: `first-${index}`,
      })),
    });
    const secondTracePath = writeTraceZipFixture(outputDirectory, "trace-console-cap-second.zip", {
      requestBody: JSON.stringify({ request: "hello" }),
      responseBody: JSON.stringify({ response: "world" }),
      traceEvents: [{ type: "console", messageType: "error", text: "second-should-be-dropped" }],
    });

    reporter.onTestEnd(
      createMockTestCase({}, { outputDirectory }),
      createMockResult({
        attachments: [
          { name: "trace-1", contentType: "application/zip", path: firstTracePath },
          { name: "trace-2", contentType: "application/zip", path: secondTracePath },
        ],
      }),
    );
    reporter.onEnd({ status: "passed" } as FullResult);

    const report = readReport(outputFile);
    const [attempt] = (report.tests[0] as ReportTestWithAttempts).attempts;

    expect(attempt?.consoleMessages).toHaveLength(50);
    expect(attempt?.consoleMessages[0]?.text).toBe("first-0");
    expect(attempt?.consoleMessages.at(-1)?.text).toBe("first-49");
    expect(
      attempt?.consoleMessages.some((message) => message.text.includes("second-should-be-dropped")),
    ).toBe(false);
  });

  it("extracts diagnostics from deflate-compressed trace archives", () => {
    const reporter = new LlmReporter({ outputFile });
    reporter.onBegin(createMockConfig(), createMockSuite());

    const tracePath = writeTraceZipFixture(outputDirectory, "trace-deflate.zip", {
      requestBody: JSON.stringify({ request: "compressed" }),
      responseBody: JSON.stringify({ response: "compressed" }),
      traceEvents: [{ type: "console", messageType: "warning", text: "deflated warning" }],
      useDeflateCompression: true,
    });

    reporter.onTestEnd(
      createMockTestCase({}, { outputDirectory }),
      createMockResult({
        attachments: [{ name: "trace", contentType: "application/zip", path: tracePath }],
      }),
    );
    reporter.onEnd({ status: "passed" } as FullResult);

    const report = readReport(outputFile);
    const [attempt] = (report.tests[0] as ReportTestWithAttempts).attempts;

    expect(attempt?.network[0]?.requestBody).toBe('{"request":"compressed"}');
    expect(attempt?.network[0]?.responseBody).toBe('{"response":"compressed"}');
    expect(attempt?.consoleMessages).toContainEqual({
      type: "warning",
      text: "deflated warning",
    });
  });

  it("ignores malformed trace lines and malformed diagnostic events", () => {
    const reporter = new LlmReporter({ outputFile });
    reporter.onBegin(createMockConfig(), createMockSuite());

    const tracePath = writeTraceZipFixture(outputDirectory, "trace-malformed-events.zip", {
      requestBody: JSON.stringify({ request: "hello" }),
      responseBody: JSON.stringify({ response: "world" }),
      traceRawLines: ["not-json", "123"],
      traceEvents: [
        {
          type: "resource-snapshot",
          snapshot: {
            request: { method: "POST", url: "https://api.example.com/no-status", postData: {} },
            response: { status: "201", content: {} },
          },
        },
        {
          type: "resource-snapshot",
          snapshot: {
            request: {
              method: "POST",
              url: "https://api.example.com/binary-request",
              postData: { mimeType: "application/octet-stream", _sha1: "request-body.json" },
            },
            response: {
              status: 200,
              content: { mimeType: "application/json", _sha1: "missing-response-body.json" },
            },
          },
        },
        {
          type: "resource-snapshot",
          snapshot: {
            request: {
              method: "POST",
              url: "https://api.example.com/missing-sha",
              postData: { mimeType: "application/json" },
            },
            response: {
              status: 200,
              content: { mimeType: "; charset=utf-8", _sha1: "response-body.json" },
            },
          },
        },
        {
          type: "resource-snapshot",
          snapshot: {
            request: { method: "GET", url: "https://api.example.com/incomplete-snapshot" },
          },
        },
        { type: "console", messageType: "error" },
        { type: "event", method: "pageError" },
        { type: "event", method: "pageError", params: { error: "page exploded" } },
        { type: "event", method: "pageError", params: { error: {} } },
      ],
    });

    reporter.onTestEnd(
      createMockTestCase({}, { outputDirectory }),
      createMockResult({
        attachments: [{ name: "trace", contentType: "application/zip", path: tracePath }],
      }),
    );
    reporter.onEnd({ status: "passed" } as FullResult);

    const report = readReport(outputFile);
    const [attempt] = (report.tests[0] as ReportTestWithAttempts).attempts;

    expect(attempt?.consoleMessages).toContainEqual({ type: "pageerror", text: "page exploded" });
    expect(attempt?.network).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          method: "POST",
          url: "https://api.example.com/binary-request",
          status: 200,
        }),
      ]),
    );
    const malformedEventNetwork = attempt?.network.find(
      (request) => request.url === "https://api.example.com/binary-request",
    );
    expect(malformedEventNetwork?.requestBody).toBeUndefined();
    expect(malformedEventNetwork?.responseBody).toBeUndefined();
  });

  it("keeps diagnostics empty when traces are missing or invalid zip files", () => {
    const reporter = new LlmReporter({ outputFile });
    reporter.onBegin(createMockConfig(), createMockSuite());

    const invalidZipPath = path.join(outputDirectory, "not-a-zip.txt");
    // eslint-disable-next-line security/detect-non-literal-fs-filename
    writeFileSync(invalidZipPath, "not a zip archive");
    const missingTracePath = path.join(outputDirectory, "missing-trace.zip");

    reporter.onTestEnd(
      createMockTestCase({}, { outputDirectory }),
      createMockResult({
        attachments: [
          { name: "invalid-trace", contentType: "application/zip", path: invalidZipPath },
          { name: "missing-trace", contentType: "application/zip", path: missingTracePath },
        ],
      }),
    );
    reporter.onEnd({ status: "passed" } as FullResult);

    const report = readReport(outputFile);
    const [attempt] = (report.tests[0] as ReportTestWithAttempts).attempts;

    expect(attempt?.network).toEqual([]);
    expect(attempt?.consoleMessages).toEqual([]);
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
    const entry = report.tests[0] as ReportTestWithAttempts;

    expect(entry.status).toBe("failed");
    expect(entry.error?.message).toBe("final attempt failed");
    expect(entry.errors[0]?.snippet).toBe("console.log('snippet');");
    expect(entry.attempts).toHaveLength(2);
    expect(entry.attempts[1]?.error?.message).toBe("final attempt failed");
  });

  it("omits blank first-line step errors when flattening", () => {
    const reporter = new LlmReporter({ outputFile });
    reporter.onBegin(createMockConfig(), createMockSuite());

    reporter.onTestEnd(
      createMockTestCase(),
      createMockResult({
        steps: [
          createMockStep({
            title: "step-with-blank-error-line",
            error: { message: "   \nsecond line" },
          }),
        ],
      }),
    );
    reporter.onEnd({ status: "failed" } as FullResult);

    const report = readReport(outputFile);
    const [attempt] = (report.tests[0] as ReportTestWithAttempts).attempts;

    expect(attempt?.steps[0]).toEqual({
      title: "step-with-blank-error-line",
      category: "test.step",
      durationMs: 25,
      depth: 0,
    });
  });

  it("handles skipped tests in progress output and summary", () => {
    const reporter = new LlmReporter({ outputFile });
    const mockWrite = jest.mocked(process.stdout.write);
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
    const mockError = jest.spyOn(console, "error").mockImplementation(jest.fn());
    const stringifySpy = jest.spyOn(JSON, "stringify").mockImplementation(() => {
      throw new Error("stringify failed");
    });

    reporter.onBegin(createMockConfig(), createMockSuite());
    reporter.onTestEnd(createMockTestCase(), createMockResult());
    reporter.onEnd({ status: "passed" } as FullResult);

    expect(mockError).toHaveBeenCalledWith(
      expect.stringContaining(`LlmReporter: Failed to write report to ${outputFile}`),
      expect.any(Error),
    );

    stringifySpy.mockRestore();
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
