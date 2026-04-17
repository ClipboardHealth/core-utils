import type { TestCase, TestResult, TestStep } from "@playwright/test/reporter";
import { describe, expect, it } from "vitest";

import {
  buildFullTitle,
  buildTestError,
  collectStdio,
  filterStackToUserCode,
  flattenSteps,
  statusIndicator,
} from "./testResults";

describe(buildFullTitle, () => {
  it("joins describe suite titles with the test title", () => {
    const mockProject = { name: "chromium", outputDir: "/project/test-results" };
    const testCase = {
      title: "should pass",
      parent: {
        title: "Suite",
        type: "describe",
        parent: {
          title: "my-test.spec.ts",
          type: "file",
          parent: { title: "chromium", type: "project", parent: { type: "root" } },
          project: () => mockProject,
        },
        project: () => mockProject,
      },
    } as unknown as TestCase;

    expect(buildFullTitle(testCase)).toBe("Suite > should pass");
  });
});

describe(filterStackToUserCode, () => {
  it("removes node_modules and node:internal frames", () => {
    const stack =
      "Error: expect\n    at /project/tests/my-test.spec.ts:12:5\n    at node_modules/playwright/runner.js:100:10\n    at node:internal/foo:1:1";

    const result = filterStackToUserCode(stack);

    expect(result).toContain("/project/tests/my-test.spec.ts:12:5");
    expect(result).not.toContain("node_modules");
    expect(result).not.toContain("node:internal");
  });
});

describe(buildTestError, () => {
  it("strips ANSI and filters stack", () => {
    const error = {
      message: "\u001B[31mExpected: 1\u001B[39m",
      stack: "Error\n    at /project/test.ts:1:1\n    at node_modules/lib.js:1:1",
      location: { file: "/project/test.ts", line: 1, column: 1 },
    };

    const result = buildTestError(error);

    expect(result.message).toBe("Expected: 1");
    expect(result.stack).not.toContain("node_modules");
    expect(result.location).toStrictEqual({ file: "/project/test.ts", line: 1, column: 1 });
  });

  it("extracts diff from assertion messages", () => {
    const error = { message: 'Expected: "hello"\nReceived: "world"' };

    const result = buildTestError(error);

    expect(result.diff).toStrictEqual({ expected: '"hello"', actual: '"world"' });
  });

  it("includes snippet when present", () => {
    const error = { message: "failed", snippet: "console.log('snippet');" };

    const result = buildTestError(error);

    expect(result.snippet).toBe("console.log('snippet');");
  });

  it("handles missing message gracefully", () => {
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
    const error = {} as { message?: string };

    const result = buildTestError(error);

    expect(result.message).toBe("Unknown error");
  });
});

describe(statusIndicator, () => {
  it("returns correct indicators for each status", () => {
    expect(statusIndicator("passed")).toBe(".");
    expect(statusIndicator("failed")).toBe("F");
    expect(statusIndicator("timedOut")).toBe("T");
    expect(statusIndicator("interrupted")).toBe("I");
    expect(statusIndicator("skipped")).toBe("S");
  });
});

describe(collectStdio, () => {
  it("concatenates string and buffer chunks with ANSI stripping and capping", () => {
    const result = {
      stdout: ["hello ", Buffer.from("world")],
      stderr: [],
    } as unknown as TestResult;

    expect(collectStdio(result, "stdout")).toBe("hello world");
  });

  it("caps at 4KB", () => {
    const result = {
      stdout: ["x".repeat(5000)],
      stderr: [],
    } as unknown as TestResult;

    const output = collectStdio(result, "stdout");

    expect(output).toHaveLength(4096);
    expect(output).toContain("[truncated]");
  });
});

describe(flattenSteps, () => {
  it("flattens nested steps with depth and offsetMs", () => {
    const attemptStart = new Date("2026-01-01T00:00:00.000Z").getTime();
    const steps: TestStep[] = [
      {
        title: "outer",
        category: "test.step",
        duration: 40,
        startTime: new Date("2026-01-01T00:00:00.100Z"),
        steps: [
          {
            title: "inner",
            category: "pw:api",
            duration: 20,
            startTime: new Date("2026-01-01T00:00:00.120Z"),
            steps: [],
          } as unknown as TestStep,
        ],
      } as unknown as TestStep,
    ];

    const result = flattenSteps(steps, attemptStart);

    expect(result).toStrictEqual([
      { title: "outer", category: "test.step", durationMs: 40, depth: 0, offsetMs: 100 },
      { title: "inner", category: "pw:api", durationMs: 20, depth: 1, offsetMs: 120 },
    ]);
  });

  it("extracts first-line error from step errors", () => {
    const attemptStart = new Date("2026-01-01T00:00:00.000Z").getTime();
    const steps: TestStep[] = [
      {
        title: "failing step",
        category: "test.step",
        duration: 10,
        startTime: new Date("2026-01-01T00:00:00.000Z"),
        steps: [],
        error: { message: "first line\nsecond line" },
      } as unknown as TestStep,
    ];

    const result = flattenSteps(steps, attemptStart);

    expect(result[0]?.error).toBe("first line");
  });

  it("omits error when first line is blank", () => {
    const attemptStart = new Date("2026-01-01T00:00:00.000Z").getTime();
    const steps: TestStep[] = [
      {
        title: "blank-error",
        category: "test.step",
        duration: 10,
        startTime: new Date("2026-01-01T00:00:00.000Z"),
        steps: [],
        error: { message: "   \nsecond line" },
      } as unknown as TestStep,
    ];

    const result = flattenSteps(steps, attemptStart);

    expect(result[0]?.error).toBeUndefined();
  });
});
