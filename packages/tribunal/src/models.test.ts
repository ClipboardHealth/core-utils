import {
  formatModelSpec,
  parseModelOverride,
  parseModelRole,
  parseModelSpec,
  resolveModelSet,
} from "./models.ts";

describe("model parsing", () => {
  it("parses provider model strings", () => {
    const actual = parseModelSpec("anthropic:claude-opus-4-7");

    expect(actual).toStrictEqual({ modelId: "claude-opus-4-7", provider: "anthropic" });
  });

  it("rejects unknown providers", () => {
    expect(() => parseModelSpec("local:llama")).toThrow("Unknown provider");
  });

  it("rejects missing model ids", () => {
    expect(() => parseModelSpec("openai:")).toThrow("provider:model-id");
  });

  it("rejects whitespace-only model ids", () => {
    expect(() => parseModelSpec("openai:   ")).toThrow("provider:model-id");
  });

  it("parses role model overrides", () => {
    const actual = parseModelOverride("skeptic=openai:gpt-5.4");

    expect(actual).toStrictEqual({
      model: { modelId: "gpt-5.4", provider: "openai" },
      role: "skeptic",
    });
  });

  it("rejects deliberator overrides in role model flags", () => {
    expect(() => parseModelOverride("deliberator=openai:gpt-5.4")).toThrow("Use --deliberator");
  });

  it("parses model roles including the deliberator", () => {
    expect(parseModelRole("deliberator")).toBe("deliberator");
  });

  it("resolves defaults, environment overrides, and CLI overrides", () => {
    const actual = resolveModelSet({
      environment: {
        TRIBUNAL_ADVOCATE_MODEL: "openai:gpt-5.4",
        TRIBUNAL_DELIBERATOR_MODEL: "google:gemini-3.1-pro-preview",
      },
      overrides: {
        advocate: { modelId: "claude-opus-4-7", provider: "anthropic" },
      },
    });

    expect(formatModelSpec(actual.advocate)).toBe("anthropic:claude-opus-4-7");
    expect(formatModelSpec(actual.deliberator)).toBe("google:gemini-3.1-pro-preview");
  });
});
