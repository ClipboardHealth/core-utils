import { existsSync, statSync } from "node:fs";

import type { RunCommandOptions } from "../lib/commandRunner.ts";
import { loadConfig, type ResolvedConfig } from "../lib/config.ts";
import { detectHostCapabilities } from "../lib/host.ts";
import { readEnvironmentVariable } from "../lib/util.ts";
import { captureConsoleLog, type ConsoleCapture } from "../testHelpers/consoleCapture.ts";
import { deleteEnvironmentVariable, setEnvironmentVariable } from "../testHelpers/env.ts";
import { doctor } from "./doctor.ts";

// oxlint-disable-next-line jest/no-untyped-mock-factory -- typed dynamic imports conflict with Node builtin module typings
vi.mock("node:fs", () => ({
  existsSync: vi.fn<typeof existsSync>(),
  statSync: vi.fn<typeof statSync>(),
}));
vi.mock(import("../lib/config.ts"), async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, loadConfig: vi.fn<typeof loadConfig>() };
});
vi.mock(import("../lib/host.ts"), async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, detectHostCapabilities: vi.fn<typeof detectHostCapabilities>() };
});
type RunCommandMock = (
  command: string,
  arguments_: readonly string[],
  options?: RunCommandOptions,
) => string;

const runCommandMock = vi.hoisted(() => vi.fn<RunCommandMock>());

vi.mock(import("../lib/commandRunner.ts"), async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    runCommand: runCommandMock,
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- test mock intentionally shares one recorder across sync and async command APIs.
    runCommandAsync: runCommandMock as unknown as typeof actual.runCommandAsync,
  };
});

const existsMock = vi.mocked(existsSync);
const statMock = vi.mocked(statSync);
const loadConfigMock = vi.mocked(loadConfig);
const detectHostMock = vi.mocked(detectHostCapabilities);

function makeConfig(overrides: Partial<ResolvedConfig["models"]> = {}): ResolvedConfig {
  return {
    linear: {
      projectSlug: "x-aaaaaaaaaaaa",
      slugId: "aaaaaaaaaaaa",
      statuses: { todo: "Todo", inProgress: "In Progress", done: "Done", terminal: ["Done"] },
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
      default: "claude",
      isolation: "auto",
      definitions: {
        claude: { cmd: "safehouse claude --permission-mode auto", color: "#fff" },
      },
      ...overrides,
    },
    prompts: { initial: "x" },
    workspaceKind: "auto",
    logging: { file: "/tmp/groundcrew-test.log" },
  };
}

function statsWithDirectoryValue(isDirectory: boolean): ReturnType<typeof statSync> {
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- tests only need the statSync isDirectory surface
  return { isDirectory: () => isDirectory } as ReturnType<typeof statSync>;
}

function firstArgument(arguments_: unknown): string {
  if (Array.isArray(arguments_) && typeof arguments_[0] === "string") {
    return arguments_[0];
  }
  return "";
}

function checkedCommands(): string[] {
  return runCommandMock.mock.calls
    .map((call) => firstArgument(call[1]))
    .filter((token) => token.length > 0);
}

function mockWhichFailure(target: string, message: string): void {
  runCommandMock.mockImplementation((_cmd, arguments_) => {
    const candidate = firstArgument(arguments_);
    if (candidate === target) {
      throw new Error(message);
    }
    return `/usr/bin/${candidate}\n`;
  });
}

function mockWhichEmpty(target: string): void {
  runCommandMock.mockImplementation((_cmd, arguments_) => {
    const candidate = firstArgument(arguments_);
    return candidate === target ? "" : `/usr/bin/${candidate}\n`;
  });
}

function mockMissingPath(missingPath: string): void {
  existsMock.mockImplementation((path) => path !== missingPath);
}

describe(doctor, () => {
  let consoleLog: ConsoleCapture;
  const originalEnvironment = readEnvironmentVariable("LINEAR_API_KEY");

  beforeEach(() => {
    consoleLog = captureConsoleLog();
    setEnvironmentVariable("LINEAR_API_KEY", "lin_api_test");
    existsMock.mockReturnValue(true);
    statMock.mockReturnValue(statsWithDirectoryValue(true));
    detectHostMock.mockResolvedValue({
      hasSafehouse: true,
      hasSbx: true,
      hasCmux: true,
      hasTmux: false,
      isMacOS: true,
      isSafehouseSupported: true,
    });
    runCommandMock.mockImplementation((_cmd, arguments_) => {
      const target = firstArgument(arguments_);
      return `/usr/bin/${target}\n`;
    });
  });

  afterEach(() => {
    consoleLog.restore();
    if (originalEnvironment === undefined) {
      deleteEnvironmentVariable("LINEAR_API_KEY");
    } else {
      setEnvironmentVariable("LINEAR_API_KEY", originalEnvironment);
    }
    vi.resetAllMocks();
  });

  it("returns false when config loading fails", async () => {
    loadConfigMock.mockRejectedValue(new Error("bad config"));

    const actual = await doctor();

    expect(actual).toBe(false);
    expect(consoleLog.output()).toContain("config: bad config");
  });

  it("returns false when host-capability probing throws", async () => {
    loadConfigMock.mockResolvedValue(makeConfig());
    detectHostMock.mockRejectedValue(new Error("probe blew up"));

    const actual = await doctor();

    expect(actual).toBe(false);
    expect(consoleLog.output()).toContain("host: probe blew up");
  });

  it("returns true when all required checks pass", async () => {
    loadConfigMock.mockResolvedValue(makeConfig());

    const actual = await doctor();

    expect(actual).toBe(true);
    expect(consoleLog.output()).toContain("All required checks passed");
  });

  it("returns false and reports a missing LINEAR_API_KEY", async () => {
    deleteEnvironmentVariable("LINEAR_API_KEY");
    loadConfigMock.mockResolvedValue(makeConfig());

    const actual = await doctor();

    expect(actual).toBe(false);
    expect(consoleLog.output()).toContain("$LINEAR_API_KEY");
    expect(consoleLog.output()).toContain("export the variable");
  });

  it("returns false when a required CLI tool is missing", async () => {
    loadConfigMock.mockResolvedValue(makeConfig());
    mockWhichFailure("git", "not found");

    const actual = await doctor();

    expect(actual).toBe(false);
    expect(consoleLog.output()).toContain("[--] git");
  });

  it("treats an empty `which` result as missing", async () => {
    loadConfigMock.mockResolvedValue(makeConfig());
    mockWhichEmpty("cmux");

    const actual = await doctor();

    expect(actual).toBe(false);
  });

  it("hints to mkdir -p when the workspace dir is missing", async () => {
    loadConfigMock.mockResolvedValue(makeConfig());
    mockMissingPath("/work");

    const actual = await doctor();

    expect(actual).toBe(false);
    expect(consoleLog.output()).toContain('mkdir -p "/work"');
  });

  it("treats a non-directory project path as missing", async () => {
    loadConfigMock.mockResolvedValue(makeConfig());
    statMock.mockReturnValue(statsWithDirectoryValue(false));

    const actual = await doctor();

    expect(actual).toBe(false);
  });

  it("handles statSync throwing as a missing directory", async () => {
    loadConfigMock.mockResolvedValue(makeConfig());
    statMock.mockImplementation(() => {
      throw new Error("permission denied");
    });

    const actual = await doctor();

    expect(actual).toBe(false);
  });

  it("checks both wrapper and wrapped commands when the cmd is `safehouse claude --foo`", async () => {
    loadConfigMock.mockResolvedValue(makeConfig());

    await doctor();

    const checked = checkedCommands();
    expect(checked).toContain("safehouse");
    expect(checked).toContain("claude");
  });

  it("skips flag values when tokenizing model commands", async () => {
    loadConfigMock.mockResolvedValue(
      makeConfig({
        default: "node-cli",
        definitions: {
          "node-cli": { cmd: "node --inspect script.ts", color: "#fff" },
        },
      }),
    );

    await doctor();

    const checked = checkedCommands();
    expect(checked).toContain("node");
    expect(checked).not.toContain("script.ts");
  });

  it("annotates safehouse with the macOS-only hint when missing", async () => {
    loadConfigMock.mockResolvedValue(makeConfig());
    mockWhichFailure("safehouse", "nope");

    const actual = await doctor();

    expect(actual).toBe(false);
    expect(consoleLog.output()).toContain("macOS-only sandbox");
  });

  it("adds an optional codexbar check when any model has usage configured", async () => {
    loadConfigMock.mockResolvedValue(
      makeConfig({
        default: "claude",
        definitions: {
          claude: {
            cmd: "claude",
            color: "#fff",
            usage: { codexbar: { provider: "claude", source: "oauth" } },
          },
        },
      }),
    );
    mockWhichFailure("codexbar", "not installed");

    const actual = await doctor();

    // codexbar is not required; doctor still passes when only it is missing.
    expect(actual).toBe(true);
    expect(consoleLog.output()).toContain("[? ] codexbar");
    expect(consoleLog.output()).toContain("optional");
  });

  it("omits the hint when both `which` and the caller produce nothing", async () => {
    loadConfigMock.mockResolvedValue(
      makeConfig({
        default: "bare",
        definitions: {
          bare: { cmd: "bare-cli", color: "#fff" },
        },
      }),
    );
    mockWhichFailure("bare-cli", "missing");

    await doctor();

    expect(consoleLog.output()).toMatch(/\[--] bare-cli\s*$/m);
  });

  it("treats the token after a leading flag as the flag's value and stops after MAX tokens", async () => {
    loadConfigMock.mockResolvedValue(
      makeConfig({
        default: "deep",
        definitions: {
          deep: { cmd: "--leading-flag a b c", color: "#fff" },
        },
      }),
    );

    await doctor();

    const checked = checkedCommands();
    expect(checked).not.toContain("a");
    expect(checked).toContain("b");
    expect(checked).toContain("c");
  });

  it("handles trailing flags whose value is missing", async () => {
    loadConfigMock.mockResolvedValue(
      makeConfig({
        default: "trailing",
        definitions: {
          trailing: { cmd: "alpha --tail", color: "#fff" },
        },
      }),
    );

    await doctor();

    const checked = checkedCommands();
    expect(checked).toContain("alpha");
  });

  it("checks sbx readiness without requiring host agent binaries for sbx commands", async () => {
    detectHostMock.mockResolvedValue({
      hasSafehouse: false,
      hasSbx: true,
      hasCmux: true,
      hasTmux: false,
      isMacOS: true,
      isSafehouseSupported: true,
    });
    loadConfigMock.mockResolvedValue(
      makeConfig({
        default: "claude",
        definitions: {
          claude: {
            cmd: "claude --permission-mode auto",
            color: "#fff",
            isolation: "docker",
            sandbox: { agent: "claude" },
          },
        },
      }),
    );

    const actual = await doctor();

    expect(actual).toBe(true);
    expect(runCommandMock).toHaveBeenCalledWith("sbx", ["diagnose"]);
    const checked = checkedCommands();
    expect(checked).toContain("sbx");
    expect(checked).not.toContain("run");
    expect(checked).not.toContain("claude");
  });

  it("skips sbx diagnose when the sbx binary is missing", async () => {
    detectHostMock.mockResolvedValue({
      hasSafehouse: false,
      hasSbx: false,
      hasCmux: true,
      hasTmux: false,
      isMacOS: true,
      isSafehouseSupported: true,
    });
    loadConfigMock.mockResolvedValue(
      makeConfig({
        default: "claude",
        definitions: {
          claude: {
            cmd: "claude --permission-mode auto",
            color: "#fff",
            isolation: "docker",
            sandbox: { agent: "claude" },
          },
        },
      }),
    );
    mockWhichFailure("sbx", "not installed");

    const actual = await doctor();

    expect(actual).toBe(false);
    expect(runCommandMock).not.toHaveBeenCalledWith("sbx", ["diagnose"]);
    expect(consoleLog.output()).not.toContain("sbx diagnose");
  });

  it("fails with an actionable hint when sbx diagnose fails", async () => {
    detectHostMock.mockResolvedValue({
      hasSafehouse: false,
      hasSbx: true,
      hasCmux: true,
      hasTmux: false,
      isMacOS: true,
      isSafehouseSupported: true,
    });
    loadConfigMock.mockResolvedValue(
      makeConfig({
        default: "claude",
        definitions: {
          claude: {
            cmd: "claude --permission-mode auto",
            color: "#fff",
            isolation: "docker",
            sandbox: { agent: "claude" },
          },
        },
      }),
    );
    runCommandMock
      .mockReturnValueOnce("/usr/bin/git\n")
      .mockReturnValueOnce("/usr/bin/cmux\n")
      .mockReturnValueOnce("/usr/bin/sbx\n")
      .mockImplementationOnce(() => {
        throw new Error("not signed in");
      });

    const actual = await doctor();

    expect(actual).toBe(false);
    const lines = consoleLog.output();
    expect(lines).toContain("sbx diagnose");
    expect(lines).toContain("sbx daemon start");
    expect(lines).toContain("sbx login");
  });

  it("reports the resolved isolation strategy per model", async () => {
    detectHostMock.mockResolvedValue({
      hasSafehouse: true,
      hasSbx: false,
      hasCmux: true,
      hasTmux: false,
      isMacOS: true,
      isSafehouseSupported: true,
    });
    loadConfigMock.mockResolvedValue(
      makeConfig({
        default: "claude",
        definitions: {
          claude: { cmd: "claude --permission-mode auto", color: "#fff" },
        },
      }),
    );

    await doctor();

    const lines = consoleLog.output();
    expect(lines).toContain("Isolation strategy");
    expect(lines).toMatch(/claude:.*resolved=safehouse/);
  });

  it("falls back to the global isolation when reporting a model with no per-model override", async () => {
    detectHostMock.mockResolvedValue({
      hasSafehouse: false,
      hasSbx: false,
      hasCmux: true,
      hasTmux: false,
      isMacOS: true,
      isSafehouseSupported: true,
    });
    loadConfigMock.mockResolvedValue(
      makeConfig({
        default: "claude",
        isolation: "safehouse",
        definitions: {
          claude: { cmd: "claude --permission-mode auto", color: "#fff" },
        },
      }),
    );

    const actual = await doctor();

    expect(actual).toBe(false);
    const lines = consoleLog.output();
    expect(lines).toMatch(/claude: requested=safehouse/);
  });

  it("checks only the agent command when the strategy resolves to none", async () => {
    detectHostMock.mockResolvedValue({
      hasSafehouse: false,
      hasSbx: false,
      hasCmux: true,
      hasTmux: false,
      isMacOS: true,
      isSafehouseSupported: true,
    });
    loadConfigMock.mockResolvedValue(
      makeConfig({
        default: "claude",
        isolation: "none",
        definitions: {
          claude: { cmd: "claude --permission-mode auto", color: "#fff" },
        },
      }),
    );

    await doctor();

    const checked = checkedCommands();
    expect(checked).toContain("claude");
    expect(checked).not.toContain("safehouse");
    expect(checked).not.toContain("sbx");
  });

  it("reports auto isolation failure when no isolated runner is available", async () => {
    detectHostMock.mockResolvedValue({
      hasSafehouse: false,
      hasSbx: false,
      hasCmux: true,
      hasTmux: false,
      isMacOS: true,
      isSafehouseSupported: true,
    });
    loadConfigMock.mockResolvedValue(
      makeConfig({
        default: "claude",
        definitions: {
          claude: { cmd: "claude --permission-mode auto", color: "#fff" },
        },
      }),
    );

    const actual = await doctor();

    expect(actual).toBe(false);
    const lines = consoleLog.output();
    expect(lines).toMatch(/claude: requested=auto/);
    expect(lines).toContain("could not find an isolated runner");
  });

  it("reports a per-model isolation failure without throwing", async () => {
    detectHostMock.mockResolvedValue({
      hasSafehouse: false,
      hasSbx: false,
      hasCmux: true,
      hasTmux: false,
      isMacOS: true,
      isSafehouseSupported: true,
    });
    loadConfigMock.mockResolvedValue(
      makeConfig({
        default: "claude",
        definitions: {
          claude: {
            cmd: "claude --permission-mode auto",
            color: "#fff",
            isolation: "safehouse",
          },
        },
      }),
    );

    const actual = await doctor();

    expect(actual).toBe(false);
    const lines = consoleLog.output();
    expect(lines).toMatch(/claude: requested=safehouse/);
    expect(lines).toContain("safehouse binary is not on PATH");
  });

  it("checks tmux instead of cmux when workspaceKind resolves to tmux", async () => {
    detectHostMock.mockResolvedValue({
      hasSafehouse: false,
      hasSbx: false,
      hasCmux: false,
      hasTmux: true,
      isMacOS: true,
      isSafehouseSupported: true,
    });
    loadConfigMock.mockResolvedValue({
      ...makeConfig({ isolation: "none" }),
      workspaceKind: "tmux",
    });

    const actual = await doctor();

    expect(actual).toBe(true);
    const lines = consoleLog.output();
    expect(lines).toMatch(/requested=tmux, resolved=tmux/);
    expect(checkedCommands()).toContain("tmux");
    expect(checkedCommands()).not.toContain("cmux");
  });

  it("reports a workspaceKind failure when the chosen backend's binary is missing", async () => {
    detectHostMock.mockResolvedValue({
      hasSafehouse: false,
      hasSbx: false,
      hasCmux: false,
      hasTmux: false,
      isMacOS: true,
      isSafehouseSupported: true,
    });
    loadConfigMock.mockResolvedValue({ ...makeConfig(), workspaceKind: "cmux" });

    const actual = await doctor();

    expect(actual).toBe(false);
    const lines = consoleLog.output();
    expect(lines).toMatch(/requested=cmux/);
    expect(lines).toContain("cmux binary is not on PATH");
  });
});
