import {
  createEmptyTribunalConfig,
  createEnvironmentWithTribunalConfig,
  loadTribunalConfig,
  parseTribunalConfig,
} from "./config.ts";

describe("Tribunal config loading", () => {
  it("returns empty defaults when no config is found", async () => {
    const actual = await loadTribunalConfig({
      cwd: "/repo",
      search: async () => null,
    });

    expect(actual).toStrictEqual(createEmptyTribunalConfig());
  });

  it("parses an example-shaped config", () => {
    const actual = parseTribunalConfig({
      apiKeys: {
        anthropic: "op://Private/ANTHROPIC_API_KEY/credential",
        googleGenerativeAi: "op://Private/GOOGLE_GENERATIVE_AI_API_KEY/credential",
        openai: "op://Private/OPENAI_API_KEY/credential",
      },
      models: {
        advocate: "anthropic:claude-opus-4-7",
        analyst: "google:gemini-3.1-pro-preview",
        deliberator: "openai:gpt-5.5",
        skeptic: "openai:gpt-5.5",
      },
      outputFormat: "markdown",
      reasoning: {
        advocate: "max",
        analyst: "high",
        deliberator: "xhigh",
        skeptic: "xhigh",
      },
      saveIntermediates: false,
      showPerspectives: true,
    });

    expect(actual).toStrictEqual({
      apiKeys: {
        anthropic: "op://Private/ANTHROPIC_API_KEY/credential",
        googleGenerativeAi: "op://Private/GOOGLE_GENERATIVE_AI_API_KEY/credential",
        openai: "op://Private/OPENAI_API_KEY/credential",
      },
      models: {
        advocate: { modelId: "claude-opus-4-7", provider: "anthropic" },
        analyst: { modelId: "gemini-3.1-pro-preview", provider: "google" },
        deliberator: { modelId: "gpt-5.5", provider: "openai" },
        skeptic: { modelId: "gpt-5.5", provider: "openai" },
      },
      outputFormat: "markdown",
      reasoning: {
        advocate: "max",
        analyst: "high",
        deliberator: "xhigh",
        skeptic: "xhigh",
      },
      saveIntermediates: false,
      showPerspectives: true,
    });
  });

  it("fails with config path context for invalid model specs", async () => {
    await expect(
      loadTribunalConfig({
        cwd: "/repo",
        search: async () => ({
          config: { models: { skeptic: "local:llama" } },
          filepath: "/repo/tribunal.config.json",
        }),
      }),
    ).rejects.toThrow(
      "Failed to parse Tribunal config at /repo/tribunal.config.json: Invalid models.skeptic: Unknown provider: local",
    );
  });

  it("maps configured API keys into environment variables", () => {
    const actual = createEnvironmentWithTribunalConfig({
      config: parseTribunalConfig({
        apiKeys: {
          googleGenerativeAi: "op://Private/GOOGLE_GENERATIVE_AI_API_KEY/credential",
          openai: "op://Private/OPENAI_API_KEY/credential",
        },
      }),
      environment: {
        ANTHROPIC_API_KEY: "existing-anthropic-key",
      },
    });

    expect(actual).toStrictEqual({
      ANTHROPIC_API_KEY: "existing-anthropic-key",
      GOOGLE_GENERATIVE_AI_API_KEY: "op://Private/GOOGLE_GENERATIVE_AI_API_KEY/credential",
      OPENAI_API_KEY: "op://Private/OPENAI_API_KEY/credential",
    });
  });
});
