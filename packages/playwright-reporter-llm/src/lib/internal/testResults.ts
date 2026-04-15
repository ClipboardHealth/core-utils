import type {
  Suite,
  TestCase,
  TestError as PlaywrightTestError,
  TestResult,
  TestStep,
} from "@playwright/test/reporter";

import type { FlatStep, TestError, TestStatus } from "../types";
import { capOutput, extractFirstLine, stripAnsi } from "./textProcessing";

export function buildFullTitle(test: TestCase): string {
  const parts: string[] = [];
  let current: Suite | undefined = test.parent;
  while (current) {
    if (current.title && current.type === "describe") {
      parts.unshift(current.title);
    }
    current = current.parent;
  }
  parts.push(test.title);
  return parts.join(" > ");
}

export function filterStackToUserCode(stack: string): string {
  return stack
    .split("\n")
    .filter((line) => {
      if (!line.includes("    at ")) {
        return true;
      }
      return !line.includes("node_modules") && !line.includes("node:internal");
    })
    .join("\n");
}

function extractDiff(message: string): { expected: string; actual: string } | undefined {
  const lines = message.split("\n");
  let expectedValue: string | undefined;
  let actualValue: string | undefined;

  for (const line of lines) {
    const expectedMatch = /^Expected\b[^:]*:[ \t]*(.+)/i.exec(line);
    if (expectedMatch?.[1]) {
      expectedValue = stripAnsi(expectedMatch[1]).trim();
    }
    const receivedMatch = /^Received\b[^:]*:[ \t]*(.+)/i.exec(line);
    if (receivedMatch?.[1]) {
      actualValue = stripAnsi(receivedMatch[1]).trim();
    }
  }

  if (expectedValue && actualValue) {
    return { expected: expectedValue, actual: actualValue };
  }

  return undefined;
}

export function buildTestError(error: PlaywrightTestError): TestError {
  const testError: TestError = {
    message: stripAnsi(error.message ?? "Unknown error"),
  };

  if (error.stack) {
    testError.stack = filterStackToUserCode(stripAnsi(error.stack));
  }
  if (error.snippet) {
    testError.snippet = stripAnsi(error.snippet);
  }

  const diff = extractDiff(error.message ?? "");
  if (diff) {
    testError.diff = diff;
  }

  if (error.location) {
    const { file, line, column } = error.location;
    testError.location = { file, line, column };
  }

  return testError;
}

export function statusIndicator(status: TestStatus): string {
  switch (status) {
    case "passed": {
      return ".";
    }
    case "failed": {
      return "F";
    }
    case "timedOut": {
      return "T";
    }
    case "interrupted": {
      return "I";
    }
    case "skipped": {
      return "S";
    }
    default: {
      return "?";
    }
  }
}

export function collectStdio(result: TestResult, channel: "stdout" | "stderr"): string {
  const text = result[channel]
    .map((chunk) => (typeof chunk === "string" ? chunk : chunk.toString("utf8")))
    .join("");
  return capOutput(stripAnsi(text));
}

export function flattenSteps(
  steps: readonly TestStep[],
  attemptStartTimeMs: number,
  depth = 0,
): FlatStep[] {
  const flattenedSteps: FlatStep[] = [];

  for (const step of steps) {
    const flatStep: FlatStep = {
      title: step.title,
      category: step.category,
      durationMs: step.duration,
      depth,
      offsetMs: step.startTime.getTime() - attemptStartTimeMs,
    };

    const error = extractFirstLine(step.error?.message);
    if (error) {
      flatStep.error = error;
    }

    flattenedSteps.push(flatStep, ...flattenSteps(step.steps, attemptStartTimeMs, depth + 1));
  }

  return flattenedSteps;
}
