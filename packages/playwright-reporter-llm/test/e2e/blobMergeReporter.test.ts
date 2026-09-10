import { execFileSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import type { LlmTestReport } from "../../src/lib/types";

const PACKAGE_DIRECTORY = path.resolve(__dirname, "../..");
const PLAYWRIGHT_CLI = path.resolve(PACKAGE_DIRECTORY, "../../node_modules/.bin/playwright");
const SHARD_CONFIG = path.resolve(__dirname, "blobMerge/shard.config.ts");
const MERGE_CONFIG = path.resolve(__dirname, "blobMerge/merge.config.ts");

interface RunPlaywrightOptions {
  arguments_: string[];
  environment: NodeJS.ProcessEnv;
  expectedOutputPath?: string;
}

function runPlaywright({
  arguments_,
  environment,
  expectedOutputPath,
}: RunPlaywrightOptions): void {
  try {
    execFileSync(PLAYWRIGHT_CLI, arguments_, {
      cwd: PACKAGE_DIRECTORY,
      env: environment,
      stdio: "pipe",
      timeout: 30_000,
    });
  } catch (error) {
    // eslint-disable-next-line security/detect-non-literal-fs-filename
    if (!expectedOutputPath || !existsSync(expectedOutputPath)) {
      throw error;
    }
  }
}

interface CopyBlobReportOptions {
  sourceDirectory: string;
  targetDirectory: string;
}

function copyBlobReport({ sourceDirectory, targetDirectory }: CopyBlobReportOptions): void {
  // eslint-disable-next-line security/detect-non-literal-fs-filename
  const fileName = readdirSync(sourceDirectory).find((entry) => entry.endsWith(".zip"));
  if (!fileName) {
    throw new Error(`No blob report found in ${sourceDirectory}`);
  }
  copyFileSync(path.join(sourceDirectory, fileName), path.join(targetDirectory, fileName));
}

describe("merged blob reports", () => {
  let temporaryDirectory: string;
  let report: LlmTestReport;

  beforeAll(() => {
    temporaryDirectory = mkdtempSync(path.join(tmpdir(), "llm-reporter-blob-merge-"));
    const firstBlobDirectory = path.join(temporaryDirectory, "blob-1");
    const secondBlobDirectory = path.join(temporaryDirectory, "blob-2");
    const mergedBlobDirectory = path.join(temporaryDirectory, "merged-blobs");
    const reportPath = path.join(temporaryDirectory, "llm-report.json");
    // eslint-disable-next-line security/detect-non-literal-fs-filename
    mkdirSync(mergedBlobDirectory);

    const environment = Object.fromEntries(
      // oxlint-disable-next-line node/no-process-env
      Object.entries(process.env).filter(([key]) => !key.startsWith("JEST")),
    );

    runPlaywright({
      arguments_: ["test", "--config", SHARD_CONFIG, "--shard=1/2"],
      environment: {
        ...environment,
        PLAYWRIGHT_BLOB_OUTPUT_DIR: firstBlobDirectory,
        PLAYWRIGHT_TEST_OUTPUT_DIRECTORY: path.join(temporaryDirectory, "results-1"),
      },
      expectedOutputPath: firstBlobDirectory,
    });
    runPlaywright({
      arguments_: ["test", "--config", SHARD_CONFIG, "--shard=2/2"],
      environment: {
        ...environment,
        PLAYWRIGHT_BLOB_OUTPUT_DIR: secondBlobDirectory,
        PLAYWRIGHT_TEST_OUTPUT_DIRECTORY: path.join(temporaryDirectory, "results-2"),
      },
    });
    copyBlobReport({
      sourceDirectory: firstBlobDirectory,
      targetDirectory: mergedBlobDirectory,
    });
    copyBlobReport({
      sourceDirectory: secondBlobDirectory,
      targetDirectory: mergedBlobDirectory,
    });
    runPlaywright({
      arguments_: ["merge-reports", "--config", MERGE_CONFIG, mergedBlobDirectory],
      environment: {
        ...environment,
        PLAYWRIGHT_LLM_OUTPUT_FILE: reportPath,
      },
      expectedOutputPath: reportPath,
    });

    // eslint-disable-next-line security/detect-non-literal-fs-filename
    report = JSON.parse(readFileSync(reportPath, "utf8")) as LlmTestReport;
  }, 100_000);

  afterAll(() => {
    rmSync(temporaryDirectory, { recursive: true, force: true });
  });

  it("retains tests and attempts that emit stdio", () => {
    const flakyTest = report.tests.find((entry) =>
      entry.title.includes("retains stdout from every flaky attempt"),
    );
    const failedTest = report.tests.find((entry) =>
      entry.title.includes("retains stdout from every failed attempt"),
    );

    expect({
      summary: report.summary,
      testCount: report.tests.length,
      flakyTest: {
        status: flakyTest?.status,
        flaky: flakyTest?.flaky,
        attemptStatuses: flakyTest?.attempts.map((attempt) => attempt.status),
        attemptStdout: flakyTest?.attempts.map((attempt) => attempt.stdout),
      },
      failedTest: {
        status: failedTest?.status,
        flaky: failedTest?.flaky,
        attemptStatuses: failedTest?.attempts.map((attempt) => attempt.status),
        attemptStdout: failedTest?.attempts.map((attempt) => attempt.stdout),
      },
    }).toStrictEqual({
      summary: {
        total: 4,
        passed: 2,
        failed: 1,
        flaky: 1,
        skipped: 0,
        timedOut: 0,
        interrupted: 0,
      },
      testCount: 4,
      flakyTest: {
        status: "passed",
        flaky: true,
        attemptStatuses: ["failed", "passed"],
        attemptStdout: ["flaky stdout from retry 0\n", "flaky stdout from retry 1\n"],
      },
      failedTest: {
        status: "failed",
        flaky: false,
        attemptStatuses: ["failed", "failed"],
        attemptStdout: ["failed stdout from retry 0\n", "failed stdout from retry 1\n"],
      },
    });
  });
});
