import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import type { TestResult } from "@playwright/test/reporter";

import { writeTraceZipFixture } from "./testHelpers";
import { collectAttachments, collectTraceDiagnosticsFromAttachments } from "./traceDiagnostics";

describe(collectAttachments, () => {
  it("identifies trace attachments by name and content type", () => {
    const result = {
      attachments: [
        { name: "trace", contentType: "application/zip", path: "/project/test-results/trace.zip" },
        { name: "screenshot", contentType: "image/png", path: "/project/test-results/shot.png" },
      ],
    } as unknown as TestResult;

    const { attachments, tracePaths } = collectAttachments(result, "/project/test-results");

    expect(tracePaths).toStrictEqual(["/project/test-results/trace.zip"]);
    expect(attachments).toHaveLength(2);
    expect(attachments[0]?.path).toBe("trace.zip");
  });

  it("ignores zip attachments that are not traces", () => {
    const result = {
      attachments: [
        { name: "artifact", contentType: "application/zip", path: "/project/test-results/art.zip" },
      ],
    } as unknown as TestResult;

    const { tracePaths } = collectAttachments(result, "/project/test-results");

    expect(tracePaths).toStrictEqual([]);
  });
});

describe(collectTraceDiagnosticsFromAttachments, () => {
  let temporaryDirectory: string;

  beforeEach(() => {
    temporaryDirectory = mkdtempSync(path.join(tmpdir(), "trace-diag-test-"));
  });

  afterEach(() => {
    rmSync(temporaryDirectory, { recursive: true, force: true });
  });

  it("extracts network and console from trace zip", () => {
    const tracePath = writeTraceZipFixture(temporaryDirectory, "trace.zip", {
      requestBody: JSON.stringify({ request: "hello" }),
      responseBody: JSON.stringify({ response: "world" }),
      contextOptions: { wallTimeMs: 1_767_225_600_000, monotonicTimeMs: 5000 },
      traceEvents: [{ type: "console", messageType: "error", text: "trace error" }],
    });

    const result = collectTraceDiagnosticsFromAttachments([tracePath], 1_767_225_600_000);

    expect(result.networkRequests.length).toBeGreaterThan(0);
    expect(result.consoleMessages).toContainEqual({ type: "error", text: "trace error" });
  });

  it("handles deflate-compressed archives", () => {
    const tracePath = writeTraceZipFixture(temporaryDirectory, "trace-deflate.zip", {
      requestBody: JSON.stringify({ request: "compressed" }),
      responseBody: JSON.stringify({ response: "compressed" }),
      traceEvents: [{ type: "console", messageType: "warning", text: "deflated warning" }],
      useDeflateCompression: true,
    });

    const result = collectTraceDiagnosticsFromAttachments([tracePath], 0);

    expect(result.networkRequests[0]?.requestBody).toBe('{"request":"compressed"}');
    expect(result.consoleMessages).toContainEqual({ type: "warning", text: "deflated warning" });
  });

  it("ignores malformed trace lines", () => {
    const tracePath = writeTraceZipFixture(temporaryDirectory, "trace-malformed.zip", {
      requestBody: JSON.stringify({ request: "hello" }),
      responseBody: JSON.stringify({ response: "world" }),
      traceRawLines: ["not-json", "123"],
      traceEvents: [{ type: "event", method: "pageError", params: { error: "page exploded" } }],
    });

    const result = collectTraceDiagnosticsFromAttachments([tracePath], 0);

    expect(result.consoleMessages).toContainEqual({ type: "pageerror", text: "page exploded" });
  });

  it("returns empty when trace is an invalid zip", () => {
    const invalidPath = path.join(temporaryDirectory, "invalid.zip");
    // eslint-disable-next-line security/detect-non-literal-fs-filename
    writeFileSync(invalidPath, "not a zip archive");

    const result = collectTraceDiagnosticsFromAttachments([invalidPath], 0);

    expect(result.networkRequests).toStrictEqual([]);
    expect(result.consoleMessages).toStrictEqual([]);
  });

  it("returns empty when trace file does not exist", () => {
    const result = collectTraceDiagnosticsFromAttachments(
      [path.join(temporaryDirectory, "missing.zip")],
      0,
    );

    expect(result.networkRequests).toStrictEqual([]);
    expect(result.consoleMessages).toStrictEqual([]);
  });

  it("caps console messages across multiple trace attachments", () => {
    const firstTracePath = writeTraceZipFixture(temporaryDirectory, "trace-cap-first.zip", {
      requestBody: JSON.stringify({ request: "hello" }),
      responseBody: JSON.stringify({ response: "world" }),
      traceEvents: Array.from({ length: 60 }, (_, index) => ({
        type: "console",
        messageType: "error",
        text: `first-${index}`,
      })),
    });
    const secondTracePath = writeTraceZipFixture(temporaryDirectory, "trace-cap-second.zip", {
      requestBody: JSON.stringify({ request: "hello" }),
      responseBody: JSON.stringify({ response: "world" }),
      traceEvents: [{ type: "console", messageType: "error", text: "second-should-be-dropped" }],
    });

    const result = collectTraceDiagnosticsFromAttachments([firstTracePath, secondTracePath], 0);

    expect(result.consoleMessages).toHaveLength(50);
    expect(result.consoleMessages[0]?.text).toBe("first-0");
    expect(result.consoleMessages.some((m) => m.text.includes("second-should-be-dropped"))).toBe(
      false,
    );
  });
});
