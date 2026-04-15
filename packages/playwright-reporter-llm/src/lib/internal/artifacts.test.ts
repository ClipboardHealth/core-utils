import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import type { FailureArtifacts } from "../types";
import { embedScreenshot, extractFailureArtifacts, findScreenshotAttachment } from "./artifacts";

describe(findScreenshotAttachment, () => {
  it("prefers attachment with screenshot in the name", () => {
    const attachments = [
      { name: "trace", contentType: "application/zip", path: "/trace.zip" },
      { name: "failure-screenshot", contentType: "image/png", path: "/screenshot.png" },
      { name: "other-image", contentType: "image/jpeg", path: "/other.jpg" },
    ];

    const result = findScreenshotAttachment(attachments);

    expect(result?.name).toBe("failure-screenshot");
  });

  it("falls back to first image attachment", () => {
    const attachments = [
      { name: "trace", contentType: "application/zip", path: "/trace.zip" },
      { name: "capture", contentType: "image/png", path: "/capture.png" },
    ];

    const result = findScreenshotAttachment(attachments);

    expect(result?.name).toBe("capture");
  });

  it("skips attachments without path", () => {
    const attachments = [{ name: "screenshot", contentType: "image/png" }];

    const result = findScreenshotAttachment(attachments);

    expect(result).toBeUndefined();
  });
});

describe(extractFailureArtifacts, () => {
  it("returns undefined for passed tests", () => {
    expect(extractFailureArtifacts("passed", [])).toBeUndefined();
  });

  it("returns undefined for skipped tests", () => {
    expect(extractFailureArtifacts("skipped", [])).toBeUndefined();
  });

  it("extracts video path for failed tests", () => {
    const attachments = [{ name: "retry-video", contentType: "video/webm", path: "video.webm" }];

    const result = extractFailureArtifacts("failed", attachments);

    expect(result?.videoPath).toBe("video.webm");
  });

  it("returns empty artifacts when no video or screenshot present", () => {
    const attachments = [{ name: "trace", contentType: "application/zip", path: "trace.zip" }];

    const result = extractFailureArtifacts("failed", attachments);

    expect(result).toBeDefined();
    expect(result?.videoPath).toBeUndefined();
  });
});

describe(embedScreenshot, () => {
  let temporaryDirectory: string;

  beforeEach(() => {
    temporaryDirectory = mkdtempSync(path.join(tmpdir(), "artifacts-test-"));
  });

  afterEach(() => {
    rmSync(temporaryDirectory, { recursive: true, force: true });
  });

  it("embeds small screenshot as base64", () => {
    const screenshotPath = path.join(temporaryDirectory, "screenshot.png");
    const content = Buffer.from("fake-png-content");
    // eslint-disable-next-line security/detect-non-literal-fs-filename
    writeFileSync(screenshotPath, content);
    const failureArtifacts: FailureArtifacts = {};

    embedScreenshot(failureArtifacts, screenshotPath);

    expect(failureArtifacts.screenshotBase64).toBe(content.toString("base64"));
  });

  it("skips when base64 would exceed cap", () => {
    const screenshotPath = path.join(temporaryDirectory, "large.png");
    // eslint-disable-next-line security/detect-non-literal-fs-filename
    writeFileSync(screenshotPath, Buffer.alloc(600_000, "x"));
    const failureArtifacts: FailureArtifacts = {};

    embedScreenshot(failureArtifacts, screenshotPath);

    expect(failureArtifacts.screenshotBase64).toBeUndefined();
  });

  it("silently skips when file does not exist", () => {
    const failureArtifacts: FailureArtifacts = {};

    embedScreenshot(failureArtifacts, path.join(temporaryDirectory, "missing.png"));

    expect(failureArtifacts.screenshotBase64).toBeUndefined();
  });
});
