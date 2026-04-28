import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import type { TestResult } from "@playwright/test/reporter";

import type { NetworkReport } from "../types";
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

function emptyNetwork(): NetworkReport {
  return {
    summary: {
      observedInstances: 0,
      retainedInstances: 0,
      retainedGroups: 0,
      retainedBodies: 0,
      instancesDroppedByFilter: 0,
      instancesDroppedByGroupCap: 0,
      instancesDroppedByInstanceCap: 0,
      instancesSuppressedAsDuplicate: 0,
      instancesEvictedAfterAdmission: 0,
      bodiesOmittedByBodyCap: 0,
      bodiesTruncated: 0,
      bodiesCanonicalized: 0,
    },
    instances: [],
    groups: {},
    bodies: {},
  };
}

function networkWithInstance(offsetMs?: number): NetworkReport {
  const report = emptyNetwork();
  const instance: NetworkReport["instances"][number] = {
    id: "n0",
    groupId: "g0",
    method: "GET",
    url: "https://api.example.com/data",
    status: 200,
  };
  if (offsetMs !== undefined) {
    instance.offsetMs = offsetMs;
  }
  report.instances.push(instance);
  report.summary.observedInstances = 1;
  report.summary.retainedInstances = 1;
  report.summary.retainedGroups = 1;
  report.groups["g0"] = {
    id: "g0",
    method: "GET",
    url: "https://api.example.com/data",
    status: 200,
    occurrenceCount: 1,
    retainedInstanceCount: 1,
    suppressedInstanceCount: 0,
    evictedInstanceCount: 0,
    fingerprint: "stub",
  };
  return report;
}

describe(buildAttemptResult, () => {
  it("builds sorted timeline emitting networkId for network entries", () => {
    const result = buildAttemptResult({
      result: createMockResult(),
      errors: [],
      attachments: [],
      network: networkWithInstance(200),
      consoleMessages: [{ type: "error", text: "err", offsetMs: 300 }],
    });

    expect(result.timeline).toHaveLength(2);
    expect(result.timeline[0]).toMatchObject({
      kind: "network",
      offsetMs: 200,
      networkId: "n0",
    });
    expect(result.timeline[1]).toMatchObject({ kind: "console", offsetMs: 300 });
  });

  it("excludes network instances without offsetMs from the timeline", () => {
    const result = buildAttemptResult({
      result: createMockResult(),
      errors: [],
      attachments: [],
      network: networkWithInstance(),
      consoleMessages: [{ type: "error", text: "err" }],
    });

    expect(result.timeline).toHaveLength(0);
  });

  it("every timeline networkId resolves to an instance in the NetworkReport", () => {
    const network = networkWithInstance(100);
    const result = buildAttemptResult({
      result: createMockResult(),
      errors: [],
      attachments: [],
      network,
      consoleMessages: [],
    });

    const networkTimelineIds = result.timeline
      .filter((entry): entry is typeof entry & { kind: "network" } => entry.kind === "network")
      .map((entry) => entry.networkId);

    for (const id of networkTimelineIds) {
      expect(result.network.instances.find((inst) => inst.id === id)).toBeDefined();
    }
  });

  it("sets error from first error in list", () => {
    const result = buildAttemptResult({
      result: createMockResult(),
      errors: [{ message: "first error" }, { message: "second error" }],
      attachments: [],
      network: emptyNetwork(),
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
        network: emptyNetwork(),
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
      network: emptyNetwork(),
      consoleMessages: [],
    });

    expect(result.failureArtifacts).toBeUndefined();
  });
});
