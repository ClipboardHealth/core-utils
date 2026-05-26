import type { TestResult } from "@playwright/test/reporter";

import type {
  AttemptResult,
  ConsoleEntry,
  FlatStep,
  NetworkReport,
  TestAttachment,
  TestError,
  TimelineConsoleEntry,
  TimelineEntry,
  TimelineNetworkEntry,
  TimelineStepEntry,
} from "../types";
import type { ActionRecord } from "./actionDiagnostics";
import { embedScreenshot, extractFailureArtifacts, findScreenshotAttachment } from "./artifacts";
import { collectStdio, flattenSteps } from "./testResults";

interface BuildAttemptResultInput {
  result: TestResult;
  errors: TestError[];
  attachments: TestAttachment[];
  network: NetworkReport;
  consoleMessages: ConsoleEntry[];
  failingAction?: ActionRecord;
}

function buildTimeline(
  steps: FlatStep[],
  network: NetworkReport,
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

  const networkEntries: TimelineNetworkEntry[] = network.instances
    .filter(
      (instance): instance is typeof instance & { offsetMs: number } =>
        instance.offsetMs !== undefined,
    )
    .map((instance) => ({
      kind: "network" as const,
      offsetMs: instance.offsetMs,
      networkId: instance.id,
      method: instance.method,
      url: instance.url,
      status: instance.status,
    }));

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
  const { result, errors, attachments, network, consoleMessages, failingAction } = input;
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
    if (failingAction && shouldEnrichError(result.status)) {
      enrichErrorWithAction(firstError, failingAction);
    }
    attemptResult.error = firstError;
  }

  return attemptResult;
}

function shouldEnrichError(status: TestResult["status"]): boolean {
  return status === "failed" || status === "timedOut" || status === "interrupted";
}

function enrichErrorWithAction(error: TestError, action: ActionRecord): void {
  if (error.apiName === undefined && action.apiName !== undefined) {
    error.apiName = action.apiName;
  }
  if (error.selector === undefined && action.selector !== undefined) {
    error.selector = action.selector;
  }
  if (error.actionLog === undefined && action.log.length > 0) {
    error.actionLog = action.log;
  }
}
