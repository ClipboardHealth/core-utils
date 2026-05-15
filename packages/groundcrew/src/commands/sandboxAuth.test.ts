import type { RunCommandOptions } from "../lib/commandRunner.ts";
import { loadConfig, type ResolvedConfig } from "../lib/config.ts";
import { repoDirFor } from "../lib/worktrees.ts";
import { authSandbox, sandboxAuthCli } from "./sandboxAuth.ts";

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
vi.mock(import("../lib/config.ts"), async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, loadConfig: vi.fn<typeof loadConfig>() };
});
vi.mock(import("../lib/worktrees.ts"), async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, repoDirFor: vi.fn<typeof repoDirFor>() };
});

const loadConfigMock = vi.mocked(loadConfig);
const repoDirMock = vi.mocked(repoDirFor);

const config: ResolvedConfig = {
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
      claude: { cmd: "claude --permission-mode auto", color: "#fff", sandbox: { agent: "claude" } },
      codex: { cmd: "codex", color: "#000", sandbox: { agent: "codex" } },
      local: { cmd: "safehouse claude", color: "#ccc" },
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

function mockMissingSandbox(): void {
  runCommandMock.mockReturnValueOnce("No sandboxes found").mockReturnValue("");
}

function mockExistingSandbox(): void {
  runCommandMock
    .mockReturnValueOnce("SANDBOX AGENT STATUS\ngroundcrew-repo-a-claude claude stopped\n")
    .mockReturnValue("");
}

function mockMissingCodexSandbox(): void {
  runCommandMock
    .mockReturnValueOnce("")
    .mockReturnValueOnce("No sandboxes found")
    .mockReturnValue("");
}

describe(authSandbox, () => {
  beforeEach(() => {
    repoDirMock.mockReturnValue("/work/repo-a");
    runCommandMock.mockReturnValue("");
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("creates and attaches a missing Claude sandbox without a ticket prompt", async () => {
    mockMissingSandbox();

    await authSandbox(config, { repository: "repo-a", model: "claude" });

    expect(runCommandMock).toHaveBeenCalledWith(
      "sbx",
      ["run", "--name", "groundcrew-repo-a-claude", "claude", "/work/repo-a"],
      { stdio: "inherit" },
    );
  });

  it("creates a missing sandbox with configured template and kits", async () => {
    mockMissingSandbox();

    await authSandbox(
      {
        ...config,
        models: {
          ...config.models,
          definitions: {
            ...config.models.definitions,
            claude: {
              cmd: "claude --permission-mode auto",
              color: "#fff",
              sandbox: {
                agent: "claude",
                template: "groundcrew-node24:latest",
                kits: ["./.sbx/kit", "oci://example.com/base:1"],
              },
            },
          },
        },
      },
      { repository: "repo-a", model: "claude" },
    );

    expect(runCommandMock).toHaveBeenCalledWith(
      "sbx",
      [
        "run",
        "--name",
        "groundcrew-repo-a-claude",
        "--template",
        "groundcrew-node24:latest",
        "--kit",
        "./.sbx/kit",
        "--kit",
        "oci://example.com/base:1",
        "claude",
        "/work/repo-a",
      ],
      { stdio: "inherit" },
    );
  });

  it("reattaches an existing sandbox", async () => {
    mockExistingSandbox();

    await authSandbox(config, { repository: "repo-a", model: "claude" });

    expect(runCommandMock).toHaveBeenCalledWith("sbx", ["run", "groundcrew-repo-a-claude"], {
      stdio: "inherit",
    });
  });

  it("starts host-side OpenAI OAuth before preparing a Codex sandbox", async () => {
    mockMissingCodexSandbox();

    await authSandbox(config, { repository: "repo-a", model: "codex" });

    expect(runCommandMock).toHaveBeenNthCalledWith(
      1,
      "sbx",
      ["secret", "set", "-g", "openai", "--oauth"],
      { stdio: "inherit" },
    );
    expect(runCommandMock).toHaveBeenNthCalledWith(
      3,
      "sbx",
      ["run", "--name", "groundcrew-repo-a-codex", "codex", "/work/repo-a"],
      { stdio: "inherit" },
    );
  });

  it("rejects models that are not sandbox-backed", async () => {
    await expect(authSandbox(config, { repository: "repo-a", model: "local" })).rejects.toThrow(
      /not sandbox-backed/,
    );
  });

  it("rejects unknown models", async () => {
    await expect(authSandbox(config, { repository: "repo-a", model: "ghost" })).rejects.toThrow(
      /Unknown model: ghost/,
    );
  });
});

describe(sandboxAuthCli, () => {
  beforeEach(() => {
    loadConfigMock.mockResolvedValue(config);
    repoDirMock.mockReturnValue("/work/repo-a");
    mockMissingCodexSandbox();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("parses the auth subcommand and model option", async () => {
    await sandboxAuthCli(["auth", "--model", "codex", "repo-a"]);

    expect(runCommandMock).toHaveBeenCalledWith(
      "sbx",
      ["run", "--name", "groundcrew-repo-a-codex", "codex", "/work/repo-a"],
      { stdio: "inherit" },
    );
  });

  it("throws a usage error for unknown sandbox actions", async () => {
    await expect(sandboxAuthCli(["rm", "repo-a"])).rejects.toThrow(/Usage: crew sandbox auth/);
  });

  it("throws a usage error when the repository is missing", async () => {
    await expect(sandboxAuthCli(["auth"])).rejects.toThrow(/Usage: crew sandbox auth/);
  });

  it("throws a usage error when extra positional args are present", async () => {
    await expect(sandboxAuthCli(["auth", "repo-a", "extra"])).rejects.toThrow(
      /Usage: crew sandbox auth/,
    );
  });

  it("rejects unknown model options", async () => {
    await expect(sandboxAuthCli(["auth", "--model", "ghost", "repo-a"])).rejects.toThrow(
      /Invalid --model: ghost/,
    );
  });

  it("rejects model options with no value", async () => {
    await expect(sandboxAuthCli(["auth", "--model"])).rejects.toThrow(/--model requires a value/);
  });
});
