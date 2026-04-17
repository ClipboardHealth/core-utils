import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import type { TestResult } from "@playwright/test/reporter";
import { describe, expect, it } from "vitest";

import { buildAttemptResult } from "./attemptBuilder";

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
    startTime: new Date("2026-01-01T00:00:00.000Z"),
    steps: [],
    ...overrides,
  } as TestResult;
}

describe(buildAttemptResult, () => {
  it("builds sorted timeline from steps, network, and console entries", () => {
    const result = buildAttemptResult({
      result: createMockResult(),
      errors: [],
      attachments: [],
      network: [{ method: "GET", url: "https://api.example.com/data", status: 200, offsetMs: 200 }],
      consoleMessages: [{ type: "error", text: "err", offsetMs: 300 }],
    });

    expect(result.timeline).toHaveLength(2);
    expect(result.timeline[0]).toMatchObject({ kind: "network", offsetMs: 200 });
    expect(result.timeline[1]).toMatchObject({ kind: "console", offsetMs: 300 });
  });

  it("excludes entries without offsetMs from timeline", () => {
    const result = buildAttemptResult({
      result: createMockResult(),
      errors: [],
      attachments: [],
      network: [{ method: "GET", url: "https://api.example.com/data", status: 200 }],
      consoleMessages: [{ type: "error", text: "err" }],
    });

    expect(result.timeline).toHaveLength(0);
  });

  it("sets error from first error in list", () => {
    const result = buildAttemptResult({
      result: createMockResult(),
      errors: [{ message: "first error" }, { message: "second error" }],
      attachments: [],
      network: [],
      consoleMessages: [],
    });

    expect(result.error?.message).toBe("first error");
  });

  it("embeds screenshot for failed attempts", () => {
    const temporaryDirectory = mkdtempSync(path.join(tmpdir(), "attempt-test-"));
    try {
      const screenshotPath = path.join(temporaryDirectory, "screenshot.png");
      const content = Buffer.from("fake-png");
      // eslint-disable-next-line security/detect-non-literal-fs-filename
      writeFileSync(screenshotPath, content);

      const result = buildAttemptResult({
        result: createMockResult({
          status: "failed",
          attachments: [{ name: "screenshot", contentType: "image/png", path: screenshotPath }],
        }),
        errors: [{ message: "failed" }],
        attachments: [{ name: "screenshot", contentType: "image/png", path: "screenshot.png" }],
        network: [],
        consoleMessages: [],
      });

      expect(result.failureArtifacts?.screenshotBase64).toBe(content.toString("base64"));
    } finally {
      rmSync(temporaryDirectory, { recursive: true, force: true });
    }
  });

  it("omits failureArtifacts when no screenshot or video present", () => {
    const result = buildAttemptResult({
      result: createMockResult({
        status: "failed",
        attachments: [{ name: "trace", contentType: "application/zip", path: "/trace.zip" }],
      }),
      errors: [{ message: "failed" }],
      attachments: [{ name: "trace", contentType: "application/zip", path: "trace.zip" }],
      network: [],
      consoleMessages: [],
    });

    expect(result.failureArtifacts).toBeUndefined();
  });
});
