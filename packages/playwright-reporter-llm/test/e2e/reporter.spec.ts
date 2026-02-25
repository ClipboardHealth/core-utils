import { execSync } from "node:child_process";
import { existsSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";

import type { LlmTestReport } from "../../src/lib/types";

const testResultsDirectory = path.resolve(__dirname, "test-results");
const reportPath = path.resolve(testResultsDirectory, "llm-report.json");
const markerPath = path.resolve(testResultsDirectory, ".flaky-marker");

describe("LLM Reporter E2E", () => {
  let report: LlmTestReport;

  beforeAll(() => {
    rmSync(markerPath, { force: true });
    rmSync(reportPath, { force: true });

    // Strip Jest environment variables so Playwright doesn't detect a Jest context and skip test discovery.
    const environment = Object.fromEntries(
      Object.entries(process.env).filter(([key]) => !key.startsWith("JEST")),
    );

    try {
      execSync("npx playwright test --config test/e2e/playwright.config.ts", {
        cwd: path.resolve(__dirname, "../.."),
        timeout: 60_000,
        stdio: "pipe",
        env: environment,
      });
    } catch {
      // Playwright exits non-zero when tests fail — that's expected.
      if (!existsSync(reportPath)) {
        throw new Error("Playwright crashed before producing a report");
      }
    }

    report = JSON.parse(readFileSync(reportPath, "utf8")) as LlmTestReport;
  }, 90_000);

  it("has valid schema version and timestamp", () => {
    expect(report.schemaVersion).toBe(1);
    expect(report.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(report.durationMs).toBeGreaterThan(0);
  });

  it("has correct summary counts", () => {
    expect(report.summary.total).toBe(5);
    expect(report.summary.passed).toBe(2);
    expect(report.summary.failed).toBe(1);
    expect(report.summary.timedOut).toBe(1);
    expect(report.summary.flaky).toBe(1);
  });

  it("has environment metadata", () => {
    expect(report.environment.playwrightVersion).toBeDefined();
    expect(report.environment.nodeVersion).toMatch(/^v\d+/);
    expect(report.environment.os).toBeDefined();
    expect(report.environment.workers).toBeGreaterThan(0);
    expect(report.environment.projects).toContain("chromium");
  });

  it("excludes project and file suites from titles", () => {
    for (const test of report.tests) {
      expect(test.title).not.toContain("chromium");
      expect(test.title).not.toMatch(/\.spec\.ts/);
    }
  });

  it("contains all test entries with required fields", () => {
    expect(report.tests).toHaveLength(5);

    const validStatuses = ["passed", "failed", "timedOut", "skipped", "interrupted"];

    for (const test of report.tests) {
      expect(test.id).toBeDefined();
      expect(test.title).toBeDefined();
      expect(validStatuses).toContain(test.status);
      expect(typeof test.flaky).toBe("boolean");
      expect(test.durationMs).toBeGreaterThanOrEqual(0);
      expect(test.location.file).toBeDefined();
      expect(test.location.line).toBeGreaterThan(0);
      expect(test.project).toBe("chromium");
      expect(test.attachments).toBeInstanceOf(Array);
    }
  });

  it("has error details on failed tests", () => {
    const failedTests = report.tests.filter((t) => t.status === "failed");

    expect(failedTests.length).toBeGreaterThanOrEqual(1);

    for (const test of failedTests) {
      expect(test.errors.length).toBeGreaterThanOrEqual(1);
      expect(test.errors[0]?.message).not.toContain("\u001B[");
    }
  });

  it("detects flaky tests correctly", () => {
    const flakyTests = report.tests.filter((t) => t.flaky);

    expect(flakyTests).toHaveLength(1);
    expect(flakyTests[0]?.status).toBe("passed");
    expect(flakyTests[0]?.retries).toBeGreaterThan(0);
    expect(flakyTests[0]?.title).toContain("passes on retry");
  });

  it("has attachment entries with paths", () => {
    const attachments = report.tests.flatMap((t) => t.attachments);

    expect(attachments.length).toBeGreaterThanOrEqual(1);

    for (const attachment of attachments) {
      expect(attachment.name).toBeDefined();
      expect(attachment.contentType).toBeDefined();
    }
  });

  it("produces no duplicate entries for retried tests", () => {
    const ids = report.tests.map((t) => t.id);

    expect(ids).toHaveLength(new Set(ids).size);
  });
});
