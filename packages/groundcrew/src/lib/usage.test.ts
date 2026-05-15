import { captureConsoleLog, type ConsoleCapture } from "../testHelpers/consoleCapture.ts";
import type { RunCommandOptions } from "./commandRunner.ts";
import type { ResolvedConfig } from "./config.ts";
import { EXHAUSTED_USAGE, getUsageByModel } from "./usage.ts";

type RunCommandMock = (
  command: string,
  arguments_: readonly string[],
  options?: RunCommandOptions,
) => string;

const runCommandMock = vi.hoisted(() => vi.fn<RunCommandMock>());

vi.mock(import("./commandRunner.ts"), async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    runCommand: runCommandMock,
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- test mock intentionally shares one recorder across sync and async command APIs.
    runCommandAsync: runCommandMock as unknown as typeof actual.runCommandAsync,
  };
});

const originalPlatform = Object.getOwnPropertyDescriptor(process, "platform");

function stubPlatform(platform: NodeJS.Platform): void {
  Object.defineProperty(process, "platform", {
    configurable: true,
    value: platform,
  });
}

function restorePlatform(): void {
  if (originalPlatform !== undefined) {
    Object.defineProperty(process, "platform", originalPlatform);
  }
}

function makeConfig(
  options: {
    source?: string;
    definitions?: ResolvedConfig["models"]["definitions"];
  } = {},
): ResolvedConfig {
  const { source, definitions } = options;
  return {
    linear: {
      projectSlug: "x-aaaaaaaaaaaa",
      slugId: "aaaaaaaaaaaa",
      statuses: {
        todo: "Todo",
        inProgress: "In Progress",
        done: "Done",
        terminal: ["Done"],
      },
    },
    git: { remote: "origin", defaultBranch: "main" },
    workspace: {
      projectDir: "/work",
      knownRepositories: ["repo-a"],
    },
    orchestrator: {
      maximumInProgress: 4,
      pollIntervalMilliseconds: 1000,
      sessionLimitPercentage: 85,
    },
    models: {
      default: "codex",
      isolation: "auto",
      definitions: definitions ?? {
        codex: {
          cmd: "safehouse codex --dangerously-bypass-approvals-and-sandbox",
          color: "#3267e3",
          usage: {
            codexbar: {
              provider: "codex",
              ...(source === undefined ? {} : { source }),
            },
          },
        },
      },
    },
    prompts: { initial: "x" },
    workspaceKind: "auto",
    logging: { file: "/tmp/groundcrew-test.log" },
    remote: {
      sprite: {
        spriteName: "crew-claude-1",
        owner: "ClipboardHealth",
        repoRoot: "/home/sprite/dev",
        worktreeRoot: "/home/sprite/groundcrew/worktrees",
        secretNames: ["NPM_TOKEN", "BUF_TOKEN"],
      },
    },
  };
}

function mockCodexbarResponse(source: string): string {
  return JSON.stringify([
    {
      provider: "codex",
      source,
      usage: {
        primary: { usedPercent: 25, resetsAt: "2099-01-01T00:00:00.000Z" },
      },
    },
  ]);
}

describe(getUsageByModel, () => {
  let consoleCapture: ConsoleCapture;

  beforeEach(() => {
    runCommandMock.mockReturnValue(mockCodexbarResponse("openai-web"));
    consoleCapture = captureConsoleLog();
  });

  afterEach(() => {
    consoleCapture.restore();
    restorePlatform();
    vi.clearAllMocks();
  });

  it("defaults CodexBar usage to auto on macOS", async () => {
    stubPlatform("darwin");

    await getUsageByModel(makeConfig());

    expect(runCommandMock).toHaveBeenCalledWith(
      "codexbar",
      ["usage", "--provider", "codex", "--source", "auto", "--format", "json"],
      { timeoutMs: 30_000 },
    );
  });

  it("defaults CodexBar usage to cli outside macOS", async () => {
    stubPlatform("linux");
    runCommandMock.mockReturnValue(mockCodexbarResponse("local"));

    await getUsageByModel(makeConfig());

    expect(runCommandMock).toHaveBeenCalledWith(
      "codexbar",
      ["usage", "--provider", "codex", "--source", "cli", "--format", "json"],
      { timeoutMs: 30_000 },
    );
  });

  it("accepts CodexBar's resolved source label when auto chooses a concrete source", async () => {
    stubPlatform("darwin");

    const actual = await getUsageByModel(makeConfig());

    expect(actual["codex"]?.session).toBe(0.25);
  });

  it("uses an explicit source from the config without consulting the platform", async () => {
    stubPlatform("linux");
    runCommandMock.mockReturnValue(mockCodexbarResponse("oauth"));

    await getUsageByModel(makeConfig({ source: "oauth" }));

    expect(runCommandMock).toHaveBeenCalledWith(
      "codexbar",
      ["usage", "--provider", "codex", "--source", "oauth", "--format", "json"],
      { timeoutMs: 30_000 },
    );
  });

  it("returns an empty result when no model has usage configured", async () => {
    const actual = await getUsageByModel(
      makeConfig({
        definitions: { plain: { cmd: "plain", color: "#fff" } },
      }),
    );

    expect(actual).toStrictEqual({});
    expect(runCommandMock).not.toHaveBeenCalled();
  });

  it("fails closed when codexbar throws — marks the model exhausted and logs", async () => {
    stubPlatform("darwin");
    runCommandMock.mockImplementation(() => {
      throw new Error("codexbar exploded");
    });

    const actual = await getUsageByModel(makeConfig());

    expect(actual["codex"]).toStrictEqual(EXHAUSTED_USAGE);
    expect(consoleCapture.output()).toContain(
      "Usage check failed for codex (treating as exhausted): codexbar exploded",
    );
  });

  it("rethrows usage failures after the shutdown signal fires", async () => {
    stubPlatform("darwin");
    const controller = new AbortController();
    controller.abort();
    runCommandMock.mockImplementation(() => {
      throw new Error("codexbar interrupted");
    });

    await expect(getUsageByModel(makeConfig(), controller.signal)).rejects.toThrow(
      "codexbar interrupted",
    );
  });

  it("fails closed when codexbar returns an entry with no usage block", async () => {
    stubPlatform("darwin");
    runCommandMock.mockReturnValue(
      JSON.stringify([
        {
          provider: "codex",
          source: "auto",
          error: {
            kind: "provider",
            code: 1,
            message: "codex app-server closed stdout",
          },
        },
      ]),
    );

    const actual = await getUsageByModel(makeConfig());

    expect(actual["codex"]).toStrictEqual(EXHAUSTED_USAGE);
    expect(consoleCapture.output()).toContain("codex app-server closed stdout");
  });

  it("fails closed when codexbar returns an entry with neither usage nor error", async () => {
    stubPlatform("darwin");
    runCommandMock.mockReturnValue(JSON.stringify([{ provider: "codex", source: "auto" }]));

    const actual = await getUsageByModel(makeConfig());

    expect(actual["codex"]).toStrictEqual(EXHAUSTED_USAGE);
    expect(consoleCapture.output()).toContain("no usage data");
  });

  it("normalizes weekly windows alongside session windows", async () => {
    stubPlatform("darwin");
    runCommandMock.mockReturnValue(
      JSON.stringify([
        {
          provider: "codex",
          source: "openai-web",
          usage: {
            primary: { usedPercent: 50, resetsAt: "2099-01-01T00:00:00.000Z" },
            secondary: {
              usedPercent: 80,
              resetsAt: "2099-02-01T00:00:00.000Z",
            },
          },
        },
      ]),
    );

    const actual = await getUsageByModel(makeConfig());

    expect(actual["codex"]?.session).toBe(0.5);
    expect(actual["codex"]?.weekly).toBe(0.8);
    expect(actual["codex"]?.weekEndDuration).toBeGreaterThan(0);
  });

  it("returns null durations when resetsAt is missing or invalid", async () => {
    stubPlatform("darwin");
    runCommandMock.mockReturnValue(
      JSON.stringify([
        {
          provider: "codex",
          source: "openai-web",
          usage: {
            primary: { usedPercent: 10 },
            secondary: { usedPercent: 20, resetsAt: "not-a-date" },
          },
        },
      ]),
    );

    const actual = await getUsageByModel(makeConfig());

    expect(actual["codex"]?.sessionEndDuration).toBeNull();
    expect(actual["codex"]?.weekEndDuration).toBeNull();
  });

  it("returns null usage values when codexbar omits a window", async () => {
    stubPlatform("darwin");
    runCommandMock.mockReturnValue(
      JSON.stringify([
        {
          provider: "codex",
          source: "openai-web",
          usage: {},
        },
      ]),
    );

    const actual = await getUsageByModel(makeConfig());

    expect(actual["codex"]?.session).toBeNull();
    expect(actual["codex"]?.weekly).toBeNull();
  });

  it("clamps minutesUntil to zero when the reset time is in the past", async () => {
    stubPlatform("darwin");
    runCommandMock.mockReturnValue(
      JSON.stringify([
        {
          provider: "codex",
          source: "openai-web",
          usage: {
            primary: { usedPercent: 25, resetsAt: "1970-01-01T00:00:00.000Z" },
          },
        },
      ]),
    );

    const actual = await getUsageByModel(makeConfig());

    expect(actual["codex"]?.sessionEndDuration).toBe(0);
  });

  it("fails closed when codexbar returns no entry matching the configured provider", async () => {
    stubPlatform("darwin");
    runCommandMock.mockReturnValue(
      JSON.stringify([{ provider: "claude", source: "auto", usage: {} }]),
    );

    const actual = await getUsageByModel(makeConfig());

    expect(actual["codex"]).toStrictEqual(EXHAUSTED_USAGE);
    expect(consoleCapture.output()).toContain(
      "codexbar returned no matching entry for provider=codex",
    );
  });

  it("fails closed when an inferred source has multiple ambiguous provider matches", async () => {
    stubPlatform("darwin");
    runCommandMock.mockReturnValue(
      JSON.stringify([
        {
          provider: "codex",
          source: "openai-web",
          usage: { primary: { usedPercent: 25 } },
        },
        {
          provider: "codex",
          source: "local",
          usage: { primary: { usedPercent: 90 } },
        },
      ]),
    );

    const actual = await getUsageByModel(makeConfig());

    expect(actual["codex"]).toStrictEqual(EXHAUSTED_USAGE);
    expect(consoleCapture.output()).toContain(
      "codexbar returned no matching entry for provider=codex",
    );
  });
});
