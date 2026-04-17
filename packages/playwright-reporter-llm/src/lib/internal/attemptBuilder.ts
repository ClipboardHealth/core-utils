import type { TestResult } from "@playwright/test/reporter";

import type {
  AttemptResult,
  ConsoleEntry,
  FlatStep,
  NetworkRequest,
  TestAttachment,
  TestError,
  TimelineConsoleEntry,
  TimelineEntry,
  TimelineNetworkEntry,
  TimelineStepEntry,
} from "../types";
import { embedScreenshot, extractFailureArtifacts, findScreenshotAttachment } from "./artifacts";
import { collectStdio, flattenSteps } from "./testResults";

interface BuildAttemptResultInput {
  result: TestResult;
  errors: TestError[];
  attachments: TestAttachment[];
  network: NetworkRequest[];
  consoleMessages: ConsoleEntry[];
}

function buildTimeline(
  steps: FlatStep[],
  network: NetworkRequest[],
  consoleMessages: ConsoleEntry[],
): TimelineEntry[] {
  const stepEntries: TimelineStepEntry[] = steps.map((step) => {
    const entry: TimelineStepEntry = {
      kind: "step",
      offsetMs: step.offsetMs,
      title: step.title,
      category: step.category,
      durationMs: step.durationMs,
      depth: step.depth,
    };

    if (step.error) {
      entry.error = step.error;
    }

    return entry;
  });

  const networkEntries: TimelineNetworkEntry[] = network
    .filter(
      (request): request is NetworkRequest & { offsetMs: number } => request.offsetMs !== undefined,
    )
    .map((request) => {
      const entry: TimelineNetworkEntry = {
        kind: "network",
        offsetMs: request.offsetMs,
        method: request.method,
        url: request.url,
        status: request.status,
      };

      if (request.durationMs !== undefined) {
        entry.durationMs = request.durationMs;
      }

      if (request.resourceType) {
        entry.resourceType = request.resourceType;
      }

      if (request.traceId) {
        entry.traceId = request.traceId;
      }

      if (request.spanId) {
        entry.spanId = request.spanId;
      }

      if (request.failureText) {
        entry.failureText = request.failureText;
      }

      if (request.wasAborted !== undefined) {
        entry.wasAborted = request.wasAborted;
      }

      return entry;
    });

  const consoleEntries: TimelineConsoleEntry[] = consoleMessages
    .filter((entry): entry is ConsoleEntry & { offsetMs: number } => entry.offsetMs !== undefined)
    .map((entry) => ({
      kind: "console" as const,
      offsetMs: entry.offsetMs,
      type: entry.type,
      text: entry.text,
    }));

  // eslint-disable-next-line no-use-extend-native/no-use-extend-native
  return [...stepEntries, ...networkEntries, ...consoleEntries].toSorted(
    (a, b) => a.offsetMs - b.offsetMs,
  );
}

export function buildAttemptResult(input: BuildAttemptResultInput): AttemptResult {
  const { result, errors, attachments, network, consoleMessages } = input;
  const failureArtifacts = extractFailureArtifacts(result.status, attachments);

  if (failureArtifacts) {
    const absoluteScreenshotPath = findScreenshotAttachment(result.attachments)?.path;
    if (absoluteScreenshotPath) {
      embedScreenshot(failureArtifacts, absoluteScreenshotPath);
    }
  }

  const hasFailureContent =
    failureArtifacts !== undefined &&
    (failureArtifacts.screenshotBase64 !== undefined || failureArtifacts.videoPath !== undefined);

  const attemptStartTimeMs = result.startTime.getTime();
  const steps = flattenSteps(result.steps, attemptStartTimeMs);
  const timeline = buildTimeline(steps, network, consoleMessages);

  const attemptResult: AttemptResult = {
    attempt: result.retry + 1,
    status: result.status,
    durationMs: result.duration,
    startTime: result.startTime.toISOString(),
    workerIndex: result.workerIndex,
    parallelIndex: result.parallelIndex,
    steps,
    stdout: collectStdio(result, "stdout"),
    stderr: collectStdio(result, "stderr"),
    attachments,
    network,
    consoleMessages,
    timeline,
    ...(hasFailureContent && { failureArtifacts }),
  };

  const [firstError] = errors;
  if (firstError) {
    attemptResult.error = firstError;
  }

  return attemptResult;
}
