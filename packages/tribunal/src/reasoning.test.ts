import {
  createReasoningProviderOptions,
  parseReasoningLevel,
  parseReasoningOverride,
} from "./reasoning.ts";

describe("reasoning parsing", () => {
  it("parses role reasoning overrides", () => {
    const actual = parseReasoningOverride("deliberator=xhigh");

    expect(actual).toStrictEqual({ level: "xhigh", role: "deliberator" });
  });

  it("rejects unknown reasoning levels", () => {
    expect(() => parseReasoningLevel("deep")).toThrow("Unknown reasoning level");
  });
});

describe("reasoning provider options", () => {
  it("maps OpenAI reasoning levels to reasoning effort", () => {
    const actual = createReasoningProviderOptions({
      model: { modelId: "gpt-5.5-pro", provider: "openai" },
      reasoningLevel: "xhigh",
    });

    expect(actual).toStrictEqual({ openai: { reasoningEffort: "xhigh" } });
  });

  it("maps Google reasoning levels to thinking level", () => {
    const actual = createReasoningProviderOptions({
      model: { modelId: "gemini-3.1-pro-preview", provider: "google" },
      reasoningLevel: "high",
    });

    expect(actual).toStrictEqual({
      google: { thinkingConfig: { thinkingLevel: "high" } },
    });
  });

  it("maps Anthropic reasoning levels to effort", () => {
    const actual = createReasoningProviderOptions({
      model: { modelId: "claude-opus-4-7", provider: "anthropic" },
      reasoningLevel: "max",
    });

    expect(actual).toStrictEqual({ anthropic: { effort: "max" } });
  });

  it("rejects levels unsupported by the selected provider", () => {
    expect(() =>
      createReasoningProviderOptions({
        model: { modelId: "gemini-3.1-pro-preview", provider: "google" },
        reasoningLevel: "xhigh",
      }),
    ).toThrow("Reasoning level xhigh is not supported for google models.");
  });
});
