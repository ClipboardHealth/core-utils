import { formatOutput } from "./format.ts";
import type { TribunalResponse } from "./tribunal.ts";

const response: TribunalResponse = {
  metadata: {
    estimatedCostUsd: null,
    latencyMs: 1234,
    models: {
      advocate: { modelId: "claude-opus-4-7", provider: "anthropic" },
      analyst: { modelId: "gemini-3.1-pro-preview", provider: "google" },
      deliberator: { modelId: "gpt-5.4", provider: "openai" },
      skeptic: { modelId: "gpt-5.4", provider: "openai" },
    },
    totalUsage: { inputTokens: 100, outputTokens: 40, totalTokens: 140 },
    warnings: ["Cost estimate unavailable."],
  },
  perspectives: [
    {
      metadata: {
        latencyMs: 100,
        model: { modelId: "claude-opus-4-7", provider: "anthropic" },
        usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
      },
      result: {
        claims: [
          {
            assumptions: ["Team can execute."],
            claim: "The upside is high.",
            confidence: 0.7,
            reasoning: "Demand is clear.",
          },
        ],
        openQuestions: ["Can support handle it?"],
        role: "advocate",
        summary: "Launch has upside.",
      },
      role: "advocate",
    },
  ],
  result: {
    answer: "Launch carefully.",
    caveats: ["Watch support volume."],
    confidence: 0.72,
    consensus: ["Demand exists."],
    disagreements: ["Risk tolerance differs."],
    keyTakeaways: ["Launch scope matters."],
    openQuestions: ["Who owns rollout?"],
    recommendation: "Launch in phases.",
  },
};

describe("output formatting", () => {
  it("formats text output without perspectives by default", () => {
    const actual = formatOutput(response, { outputFormat: "text", showPerspectives: false });

    expect(actual).toContain("Tribunal");
    expect(actual).toContain("Answer\nLaunch carefully.");
    expect(actual).toContain("Recommendation\nLaunch in phases.");
    expect(actual).toContain("Confidence: 72%");
    expect(actual).not.toContain("Perspective: Advocate");
  });

  it("formats text output with perspectives", () => {
    const actual = formatOutput(response, { outputFormat: "text", showPerspectives: true });

    expect(actual).toContain("Perspective: Advocate");
    expect(actual).toContain("The upside is high.");
  });

  it("formats markdown output with perspectives", () => {
    const actual = formatOutput(response, { outputFormat: "markdown", showPerspectives: true });

    expect(actual).toContain("# Tribunal");
    expect(actual).toContain("## Perspective: Advocate");
  });

  it("formats json output as the full response", () => {
    const actual = formatOutput(response, { outputFormat: "json", showPerspectives: false });

    expect(JSON.parse(actual)).toStrictEqual(response);
  });
});
