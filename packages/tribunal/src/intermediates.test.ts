import { dirname } from "node:path";

import {
  createDefaultIntermediateOutputPath,
  createIntermediateOutputRecorder,
  type CreateIntermediateOutputRecorderInput,
} from "./intermediates.ts";
import type { TribunalResponse } from "./tribunal.ts";

type WriteResult = (contents: string) => Promise<void>;

describe("intermediate output recorder", () => {
  it("creates default output paths under ignored tribunal runs", () => {
    const actual = createDefaultIntermediateOutputPath({
      cwd: "/repo",
      now: () => new Date("2026-05-19T02:03:04.005Z"),
    });

    expect(actual).toBe("/repo/.tribunal/runs/2026-05-19T02-03-04-005Z.json");
  });

  it("persists snapshots as calls start, complete, and fail", async () => {
    const createdDirectories: string[] = [];
    const writes: string[] = [];
    const model = { modelId: "gpt-5.4", provider: "openai" } as const;
    const output = { role: "advocate", summary: "Strong upside." };

    const recorder = await createIntermediateOutputRecorder({
      filePath: "/repo/.tribunal/runs/run.json",
      makeDirectory: async (path) => {
        createdDirectories.push(path);
      },
      now: createClock([
        "2026-05-19T02:03:04.005Z",
        "2026-05-19T02:03:05.005Z",
        "2026-05-19T02:03:06.005Z",
        "2026-05-19T02:03:07.005Z",
      ]),
      request: { query: "Should we launch?" },
      writeFile: async (_path, contents) => {
        writes.push(contents);
      },
    });

    await recorder.onProgress({ model, role: "advocate", status: "started" });
    await recorder.onProgress({
      latencyMs: 1000,
      metadata: { latencyMs: 1000, model },
      model,
      output,
      role: "advocate",
      status: "completed",
    });
    await recorder.markFailed(new Error("provider failed"));

    const lastSnapshot = parseLastSnapshot(writes);

    expect(createdDirectories).toStrictEqual([dirname("/repo/.tribunal/runs/run.json")]);
    expect(writes).toHaveLength(4);
    expect(lastSnapshot).toMatchObject({
      calls: {
        advocate: {
          model,
          output,
          status: "completed",
        },
      },
      errorMessage: "provider failed",
      events: [
        {
          at: "2026-05-19T02:03:05.005Z",
          model,
          role: "advocate",
          status: "started",
        },
        {
          at: "2026-05-19T02:03:06.005Z",
          latencyMs: 1000,
          model,
          role: "advocate",
          status: "completed",
        },
      ],
      status: "failed",
    });
  });

  it("persists the final response on success", async () => {
    const createdDirectories: string[] = [];
    const writes: string[] = [];
    const response = createTribunalResponse();

    const recorder = await createIntermediateOutputRecorder({
      filePath: "/repo/.tribunal/runs/run.json",
      makeDirectory: async (path) => {
        createdDirectories.push(path);
      },
      now: createClock(["2026-05-19T02:03:04.005Z", "2026-05-19T02:03:05.005Z"]),
      request: { query: "Should we launch?" },
      writeFile: async (_path, contents) => {
        writes.push(contents);
      },
    });

    await recorder.markCompleted(response);

    const lastSnapshot = parseLastSnapshot(writes);

    expect(createdDirectories).toStrictEqual([dirname("/repo/.tribunal/runs/run.json")]);
    expect(lastSnapshot).toMatchObject({
      response,
      status: "completed",
    });
  });

  it("recovers later snapshot writes after one queued write fails", async () => {
    const createdDirectories: string[] = [];
    const writes: string[] = [];
    const model = { modelId: "gpt-5.4", provider: "openai" } as const;
    const output = { role: "advocate", summary: "Strong upside." };
    const writeResults: WriteResult[] = [
      async (contents) => {
        writes.push(contents);
      },
      async () => {
        throw new Error("temporary write failure");
      },
      async (contents) => {
        writes.push(contents);
      },
    ];
    const writeFile: NonNullable<CreateIntermediateOutputRecorderInput["writeFile"]> = async (
      _path,
      contents,
    ) => {
      await runNextWriteResult(writeResults, contents);
    };

    const recorder = await createIntermediateOutputRecorder({
      filePath: "/repo/.tribunal/runs/run.json",
      makeDirectory: async (path) => {
        createdDirectories.push(path);
      },
      now: createClock([
        "2026-05-19T02:03:04.005Z",
        "2026-05-19T02:03:05.005Z",
        "2026-05-19T02:03:06.005Z",
      ]),
      request: { query: "Should we launch?" },
      writeFile,
    });

    await expect(
      recorder.onProgress({ model, role: "advocate", status: "started" }),
    ).rejects.toThrow("temporary write failure");
    await recorder.onProgress({
      latencyMs: 1000,
      metadata: { latencyMs: 1000, model },
      model,
      output,
      role: "advocate",
      status: "completed",
    });

    const lastSnapshot = parseLastSnapshot(writes);

    expect(createdDirectories).toStrictEqual([dirname("/repo/.tribunal/runs/run.json")]);
    expect(writeResults).toHaveLength(0);
    expect(lastSnapshot).toMatchObject({
      calls: {
        advocate: {
          model,
          output,
          status: "completed",
        },
      },
      events: [
        {
          at: "2026-05-19T02:03:05.005Z",
          model,
          role: "advocate",
          status: "started",
        },
        {
          at: "2026-05-19T02:03:06.005Z",
          latencyMs: 1000,
          model,
          role: "advocate",
          status: "completed",
        },
      ],
      status: "running",
    });
  });
});

async function runNextWriteResult(writeResults: WriteResult[], contents: string): Promise<void> {
  const writeResult = writeResults.shift();

  if (writeResult === undefined) {
    throw new Error("Unexpected write.");
  }

  await writeResult(contents);
}

function createClock(values: string[]): () => Date {
  let index = 0;

  return () => {
    const value = values.at(index) ?? values.at(-1);
    index += 1;

    if (value === undefined) {
      throw new Error("Clock has no values.");
    }

    return new Date(value);
  };
}

function parseLastSnapshot(writes: string[]): unknown {
  const lastWrite = writes.at(-1);

  expect(lastWrite).toBeDefined();

  const parsed: unknown = JSON.parse(lastWrite ?? "{}");
  return parsed;
}

function createTribunalResponse(): TribunalResponse {
  return {
    metadata: {
      estimatedCostUsd: null,
      latencyMs: 1,
      models: {
        advocate: { modelId: "claude-opus-4-7", provider: "anthropic" },
        analyst: { modelId: "gemini-3.1-pro-preview", provider: "google" },
        deliberator: { modelId: "gpt-5.4", provider: "openai" },
        skeptic: { modelId: "gpt-5.4", provider: "openai" },
      },
      warnings: [],
    },
    perspectives: [],
    result: {
      answer: "Launch carefully.",
      caveats: [],
      confidence: 0.8,
      consensus: [],
      disagreements: [],
      keyTakeaways: ["Do the work."],
      openQuestions: [],
      recommendation: "Launch.",
    },
  };
}
