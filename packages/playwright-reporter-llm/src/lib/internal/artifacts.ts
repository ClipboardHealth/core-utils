import { readFileSync } from "node:fs";

import type { FailureArtifacts, TestAttachment, TestStatus } from "../types";
import { SCREENSHOT_BASE64_CAP } from "./constants";

export function findScreenshotAttachment<
  T extends { name: string; contentType: string; path?: string },
>(attachments: readonly T[]): T | undefined {
  let firstImageFallback: T | undefined;
  for (const attachment of attachments) {
    if (!attachment.path) {
      continue;
    }
    if (attachment.name.toLowerCase().includes("screenshot")) {
      return attachment;
    }
    if (!firstImageFallback && attachment.contentType.startsWith("image/")) {
      firstImageFallback = attachment;
    }
  }
  return firstImageFallback;
}

export function extractFailureArtifacts(
  status: TestStatus,
  attachments: TestAttachment[],
): FailureArtifacts | undefined {
  if (status === "passed" || status === "skipped") {
    return undefined;
  }

  const failureArtifacts: FailureArtifacts = {};
  for (const attachment of attachments) {
    if (!attachment.path) {
      continue;
    }
    if (
      !failureArtifacts.videoPath &&
      (attachment.contentType.startsWith("video/") ||
        attachment.name.toLowerCase().includes("video"))
    ) {
      failureArtifacts.videoPath = attachment.path;
    }
  }

  return failureArtifacts;
}

export function embedScreenshot(
  failureArtifacts: FailureArtifacts,
  absoluteScreenshotPath: string,
): void {
  try {
    // eslint-disable-next-line security/detect-non-literal-fs-filename
    const raw = readFileSync(absoluteScreenshotPath);
    // base64 expands ~4/3x; skip conversion when raw bytes cannot possibly fit
    if (raw.length > Math.floor((SCREENSHOT_BASE64_CAP * 3) / 4)) {
      return;
    }
    const base64 = raw.toString("base64");
    if (base64.length <= SCREENSHOT_BASE64_CAP) {
      failureArtifacts.screenshotBase64 = base64;
    }
  } catch {
    // Screenshot file may not exist or be readable — silently skip
  }
}
