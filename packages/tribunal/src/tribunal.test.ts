import type { ModelRole } from "./models.ts";
import type { DeliberationResult, PerspectiveResult } from "./schemas.ts";
import {
  type CallMetadata,
  estimateCostUsd,
  runTribunal,
  type StructuredOutputRunner,
  sumTokenUsage,
} from "./tribunal.ts";

interface MockRunnerResult {
  output: unknown;
  metadata: CallMetadata;
}

type MockRunnerHandler = () => MockRunnerResult | Promise<MockRunnerResult>;

const perspectiveResults: Record<PerspectiveResult["role"], PerspectiveResult> = {
  advocate: {
    claims: [
      {
        assumptions: [],
        claim: "It can work.",
        confidence: 0.8,
        reasoning: "The upside is clear.",
      },
    ],
    openQuestions: [],
    role: "advocate",
    summary: "Strong upside.",
  },
  analyst: {
    claims: [
      {
        assumptions: [],
        claim: "Tradeoffs exist.",
        confidence: 0.7,
        reasoning: "There are competing criteria.",
      },
    ],
    openQuestions: [],
    role: "analyst",
    summary: "There are tradeoffs.",
  },
  skeptic: {
    claims: [
      {
        assumptions: [],
        claim: "It may fail.",
        confidence: 0.6,
        reasoning: "Risks remain.",
      },
    ],
    openQuestions: [],
    role: "skeptic",
    summary: "Important risks.",
  },
};

const deliberationResult: DeliberationResult = {
  answer: "Proceed carefully.",
  caveats: [],
  confidence: 0.7,
  consensus: ["There is upside."],
  disagreements: ["Risk tolerance."],
  keyTakeaways: ["Phase the decision."],
  openQuestions: [],
  recommendation: "Proceed in phases.",
};

describe("tribunal orchestration", () => {
  it("runs all three perspectives and deliberates", async () => {
    const calls: string[] = [];
    const structuredOutputRunner = createMockRunner({
      advocate: () => createPerspectiveRunnerResult("advocate"),
      analyst: () => createPerspectiveRunnerResult("analyst"),
      deliberator: () => ({
        metadata: {
          latencyMs: 20,
          model: { modelId: "gpt-5.4", provider: "openai" },
          usage: { inputTokens: 20, outputTokens: 10, totalTokens: 30 },
        },
        output: deliberationResult,
      }),
      skeptic: () => createPerspectiveRunnerResult("skeptic"),
    });
    const observingRunner: StructuredOutputRunner = async (input) => {
      const { role } = input;
      calls.push(role);

      return await structuredOutputRunner(input);
    };

    const actual = await runTribunal(
      { query: "Should we launch?" },
      {
        now: createClock([0, 100]),
        structuredOutputRunner: observingRunner,
      },
    );

    expect(calls.toSorted()).toStrictEqual(["advocate", "analyst", "deliberator", "skeptic"]);
    expect(actual.result).toStrictEqual(deliberationResult);
    expect(actual.perspectives).toHaveLength(3);
    expect(actual.metadata.totalUsage).toStrictEqual({
      inputTokens: 50,
      outputTokens: 25,
      totalTokens: 75,
    });
    expect(actual.metadata.latencyMs).toBe(100);
  });

  it("passes reasoning levels to perspective and deliberator calls", async () => {
    const calls: Partial<Record<ModelRole, string | undefined>> = {};
    const structuredOutputRunner = createReasoningObserverRunner(calls);

    const actual = await runTribunal(
      {
        query: "Should we launch?",
        reasoning: {
          advocate: "max",
          analyst: "high",
          deliberator: "xhigh",
          skeptic: "medium",
        },
      },
      { structuredOutputRunner },
    );

    expect(calls).toStrictEqual({
      advocate: "max",
      analyst: "high",
      deliberator: "xhigh",
      skeptic: "medium",
    });
    expect(actual.metadata.reasoning).toStrictEqual({
      advocate: "max",
      analyst: "high",
      deliberator: "xhigh",
      skeptic: "medium",
    });
  });

  it("emits progress events for perspective and deliberator calls", async () => {
    const events: {
      status: string;
      role: ModelRole;
      latencyMs: number | undefined;
    }[] = [];
    const structuredOutputRunner = createMockRunner({
      advocate: () => createPerspectiveRunnerResult("advocate"),
      analyst: () => createPerspectiveRunnerResult("analyst"),
      deliberator: () => ({
        metadata: {
          latencyMs: 20,
          model: { modelId: "gpt-5.4", provider: "openai" },
        },
        output: deliberationResult,
      }),
      skeptic: () => createPerspectiveRunnerResult("skeptic"),
    });

    await runTribunal(
      { query: "Should we launch?" },
      {
        onProgress: (event) => {
          events.push({
            latencyMs: event.latencyMs,
            role: event.role,
            status: event.status,
          });
        },
        structuredOutputRunner,
      },
    );

    expect(events).toStrictEqual([
      { latencyMs: undefined, role: "advocate", status: "started" },
      { latencyMs: undefined, role: "skeptic", status: "started" },
      { latencyMs: undefined, role: "analyst", status: "started" },
      { latencyMs: 10, role: "advocate", status: "completed" },
      { latencyMs: 10, role: "skeptic", status: "completed" },
      { latencyMs: 10, role: "analyst", status: "completed" },
      { latencyMs: undefined, role: "deliberator", status: "started" },
      { latencyMs: 20, role: "deliberator", status: "completed" },
    ]);
  });

  it("emits failed progress events when a model call fails", async () => {
    const events: {
      status: string;
      role: ModelRole;
      errorMessage: string | undefined;
    }[] = [];
    const structuredOutputRunner = createMockRunner({
      advocate: () => createPerspectiveRunnerResult("advocate"),
      analyst: () => createPerspectiveRunnerResult("analyst"),
      deliberator: () => ({
        metadata: {
          latencyMs: 20,
          model: { modelId: "gpt-5.4", provider: "openai" },
        },
        output: deliberationResult,
      }),
      skeptic: () => {
        throw new Error("provider failed");
      },
    });

    await runTribunal(
      { query: "Should we launch?" },
      {
        onProgress: (event) => {
          events.push({
            errorMessage: event.errorMessage,
            role: event.role,
            status: event.status,
          });
        },
        structuredOutputRunner,
      },
    );

    expect(events).toContainEqual({
      errorMessage: "provider failed",
      role: "skeptic",
      status: "failed",
    });
  });

  it("does not let progress handler failures abort model execution", async () => {
    const structuredOutputRunner = createMockRunner({
      advocate: () => createPerspectiveRunnerResult("advocate"),
      analyst: () => createPerspectiveRunnerResult("analyst"),
      deliberator: () => ({
        metadata: {
          latencyMs: 20,
          model: { modelId: "gpt-5.4", provider: "openai" },
        },
        output: deliberationResult,
      }),
      skeptic: () => createPerspectiveRunnerResult("skeptic"),
    });

    const actual = await runTribunal(
      { query: "Should we launch?" },
      {
        onProgress: () => {
          throw new Error("recorder failed");
        },
        structuredOutputRunner,
      },
    );

    expect(actual.result).toStrictEqual(deliberationResult);
  });

  it("continues when one perspective fails", async () => {
    const structuredOutputRunner = createMockRunner({
      advocate: () => createPerspectiveRunnerResult("advocate"),
      analyst: () => createPerspectiveRunnerResult("analyst"),
      deliberator: () => ({
        metadata: {
          latencyMs: 1,
          model: { modelId: "gpt-5.4", provider: "openai" },
        },
        output: deliberationResult,
      }),
      skeptic: () => {
        throw new Error("provider failed");
      },
    });

    const actual = await runTribunal({ query: "Should we launch?" }, { structuredOutputRunner });

    expect(actual.perspectives.map((perspective) => perspective.role).toSorted()).toStrictEqual([
      "advocate",
      "analyst",
    ]);
    expect(actual.metadata.warnings).toContain("skeptic perspective failed: provider failed");
  });

  it("fails before deliberation when two perspectives fail", async () => {
    const structuredOutputRunner = createMockRunner({
      advocate: () => {
        throw new Error("advocate failed");
      },
      analyst: () => createPerspectiveRunnerResult("analyst"),
      deliberator: () => {
        throw new Error("deliberator should not run");
      },
      skeptic: () => {
        throw new Error("skeptic failed");
      },
    });

    await expect(
      runTribunal({ query: "Should we launch?" }, { structuredOutputRunner }),
    ).rejects.toThrow("At least two perspectives must succeed");
  });

  it("propagates deliberator failures", async () => {
    const structuredOutputRunner = createMockRunner({
      advocate: () => createPerspectiveRunnerResult("advocate"),
      analyst: () => createPerspectiveRunnerResult("analyst"),
      deliberator: () => {
        throw new Error("deliberator failed");
      },
      skeptic: () => createPerspectiveRunnerResult("skeptic"),
    });

    await expect(
      runTribunal({ query: "Should we launch?" }, { structuredOutputRunner }),
    ).rejects.toThrow("deliberator failed");
  });
});

describe("usage and cost", () => {
  it("aggregates token usage", () => {
    const actual = sumTokenUsage([
      { inputTokens: 1, outputTokens: 2, totalTokens: 3 },
      { inputTokens: 4, outputTokens: 5 },
      {},
    ]);

    expect(actual).toStrictEqual({ inputTokens: 5, outputTokens: 7, totalTokens: 3 });
  });

  it("returns null cost for unknown pricing", () => {
    const actual = estimateCostUsd([
      {
        metadata: {
          latencyMs: 1,
          model: { modelId: "unknown", provider: "openai" },
          usage: { inputTokens: 10, outputTokens: 10, totalTokens: 20 },
        },
        role: "deliberator",
      },
    ]);

    expect(actual).toStrictEqual({
      estimatedCostUsd: null,
      warning: "Cost estimate unavailable because pricing is unknown for openai:unknown.",
    });
  });
});

function createClock(values: number[]): () => number {
  let index = 0;

  return () => {
    const value = values.at(index) ?? values.at(-1) ?? 0;
    index += 1;
    return value;
  };
}

function createMockRunner(handlers: Record<ModelRole, MockRunnerHandler>): StructuredOutputRunner {
  return async ({ role }) => await handlers[role]();
}

function createReasoningObserverRunner(
  calls: Partial<Record<ModelRole, string | undefined>>,
): StructuredOutputRunner {
  const structuredOutputRunner = createMockRunner({
    advocate: () => createPerspectiveRunnerResult("advocate"),
    analyst: () => createPerspectiveRunnerResult("analyst"),
    deliberator: () => ({
      metadata: {
        latencyMs: 20,
        model: { modelId: "gpt-5.5-pro", provider: "openai" },
      },
      output: deliberationResult,
    }),
    skeptic: () => createPerspectiveRunnerResult("skeptic"),
  });

  return async (input) => {
    calls[input.role] = input.reasoningLevel;

    return await structuredOutputRunner(input);
  };
}

function createPerspectiveRunnerResult(role: PerspectiveResult["role"]): MockRunnerResult {
  return {
    metadata: {
      latencyMs: 10,
      model: { modelId: "mock", provider: "openai" },
      usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
    },
    output: perspectiveResults[role],
  };
}
