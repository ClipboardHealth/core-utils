import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { RunCommandOptions } from "../lib/commandRunner.ts";
import type { ResolvedConfig } from "../lib/config.ts";
import { bootstrapSpriteRepository, setupSprite, spriteCli } from "./spriteSetup.ts";

type RunCommandAsyncMock = (
  command: string,
  arguments_: readonly string[],
  options?: RunCommandOptions,
) => Promise<string | undefined>;

const runCommandMock = vi.hoisted(() => vi.fn<RunCommandAsyncMock>());
const loadConfigMock = vi.hoisted(() => vi.fn<() => Promise<Readonly<ResolvedConfig>>>());
const CLAUDE_SUBSCRIPTION_LOGIN_FLAG = ["--claude", "ai"].join("");

vi.mock(import("../lib/commandRunner.ts"), async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- test mock records calls across runCommandAsync overloads.
    runCommandAsync: runCommandMock as unknown as typeof actual.runCommandAsync,
  };
});

vi.mock(import("../lib/config.ts"), async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    loadConfig: loadConfigMock as unknown as typeof actual.loadConfig,
  };
});

function makeConfig(spriteName = "crew-default"): ResolvedConfig {
  return {
    linear: {
      projectSlug: "ai-strategy-5152195762f3",
      slugId: "5152195762f3",
      statuses: {
        todo: "Todo",
        inProgress: "In Progress",
        done: "Done",
        terminal: ["Done"],
      },
    },
    git: { remote: "origin", defaultBranch: "main" },
    workspace: { projectDir: "/repo", knownRepositories: ["core-utils"] },
    orchestrator: {
      maximumInProgress: 4,
      pollIntervalMilliseconds: 120_000,
      sessionLimitPercentage: 85,
    },
    models: {
      default: "claude",
      definitions: {
        claude: {
          cmd: "claude --permission-mode auto",
          color: "#C15F3C",
        },
      },
    },
    prompts: { initial: "{{ticket}} {{worktree}} {{title}} {{description}}" },
    workspaceKind: "tmux",
    remote: {
      sprite: {
        spriteName,
        owner: "ClipboardHealth",
        repoRoot: "/home/sprite/dev",
        worktreeRoot: "/home/sprite/groundcrew/worktrees",
        secretNames: ["NPM_TOKEN", "BUF_TOKEN"],
      },
    },
    logging: { file: "/tmp/groundcrew.log" },
  };
}

function hasRemoteCommand(call: readonly unknown[], remoteCommand: readonly string[]): boolean {
  const [, arguments_] = call;
  if (!Array.isArray(arguments_)) {
    return false;
  }
  return remoteCommand.every((part) => arguments_.includes(part));
}

function mockSpriteList(output: string): void {
  runCommandMock.mockImplementation(async (command, arguments_) => {
    if (command === "sprite" && arguments_[0] === "list") {
      return output;
    }
    if (hasRemoteCommand([command, arguments_], ["claude", "mcp", "get"])) {
      throw new Error("missing mcp server");
    }
    return "";
  });
}

function mockMissingSpriteWithMissingAgentAuth(): void {
  runCommandMock.mockImplementation(async (command, arguments_) => {
    if (command === "sprite" && arguments_[0] === "list") {
      return "";
    }
    if (hasRemoteCommand([command, arguments_], ["gh", "auth", "status"])) {
      throw new Error("gh missing");
    }
    if (hasRemoteCommand([command, arguments_], ["claude", "auth", "status"])) {
      throw new Error("claude missing");
    }
    return "";
  });
}

function mockExistingSpriteForBootstrap(): void {
  runCommandMock.mockImplementation(async (command, arguments_) => {
    if (command === "sprite" && arguments_[0] === "list") {
      return "NAME STATUS\ncrew-claude-1 running";
    }
    return "";
  });
}

function mockSpriteListWithExistingMcp(output: string): void {
  runCommandMock.mockImplementation(async (command, arguments_) => {
    if (command === "sprite" && arguments_[0] === "list") {
      return output;
    }
    return "";
  });
}

function mockSpriteListWithCodexStatus(options: {
  failuresBeforeSuccess?: number;
  alwaysFail?: boolean;
}): () => number {
  let codexStatusCalls = 0;
  runCommandMock.mockImplementation(async (command, arguments_) => {
    if (command === "sprite" && arguments_[0] === "list") {
      return "NAME STATUS\ncrew-claude-1 running";
    }
    if (hasRemoteCommand([command, arguments_], ["codex", "login", "status"])) {
      codexStatusCalls += 1;
      if (options.alwaysFail === true || codexStatusCalls <= (options.failuresBeforeSuccess ?? 0)) {
        throw new Error("codex missing");
      }
    }
    return "";
  });
  return () => codexStatusCalls;
}

function isInteractiveCodexLoginCall(call: readonly unknown[]): boolean {
  const [, arguments_] = call;
  return (
    Array.isArray(arguments_) &&
    hasRemoteCommand(call, ["codex", "login"]) &&
    !arguments_.includes("status")
  );
}

describe(spriteCli, () => {
  beforeEach(() => {
    loadConfigMock.mockResolvedValue(makeConfig());
    mockSpriteList("NAME STATUS\ncrew-claude-1 running");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it("adds only the selected MCP servers and opens Claude for their auth", async () => {
    await spriteCli([
      "setup",
      "crew-claude-1",
      "--mcp",
      "linear",
      "--mcp",
      "custom=https://example.com/mcp",
    ]);

    expect(runCommandMock).toHaveBeenCalledWith(
      "sprite",
      expect.arrayContaining(["claude", "mcp", "add", "linear", "https://mcp.linear.app/mcp"]),
    );
    expect(runCommandMock).toHaveBeenCalledWith(
      "sprite",
      expect.arrayContaining(["claude", "mcp", "add", "custom", "https://example.com/mcp"]),
    );
    expect(
      runCommandMock.mock.calls.some((call) =>
        hasRemoteCommand(call, ["slack", "https://mcp.slack.com/mcp"]),
      ),
    ).toBe(false);
    expect(runCommandMock).toHaveBeenCalledWith(
      "sprite",
      ["exec", "--tty", "-s", "crew-claude-1", "--", "claude", "--permission-mode", "auto"],
      { stdio: "inherit", timeoutMs: 0 },
    );
  });

  it("can add MCP servers without launching interactive MCP auth", async () => {
    await spriteCli(["setup", "crew-claude-1", "--mcp", "linear", "--skip-mcp-auth"]);

    expect(runCommandMock).toHaveBeenCalledWith(
      "sprite",
      expect.arrayContaining(["claude", "mcp", "add", "linear", "https://mcp.linear.app/mcp"]),
    );
    expect(
      runCommandMock.mock.calls.some((call) =>
        hasRemoteCommand(call, ["claude", "--permission-mode", "auto"]),
      ),
    ).toBe(false);
  });

  it("rejects unknown MCP aliases", async () => {
    await expect(spriteCli(["setup", "crew-claude-1", "--mcp", "unknown"])).rejects.toThrow(
      /Unknown MCP alias/,
    );
  });

  it("rejects missing setup values and invalid custom MCP names", async () => {
    await expect(spriteCli(["setup"])).rejects.toThrow(/Usage:/);
    await expect(spriteCli(["setup", "crew-claude-1", "--mcp"])).rejects.toThrow(
      /--mcp requires a value/,
    );
    await expect(
      spriteCli(["setup", "crew-claude-1", "--mcp", "bad$name=https://example.com/mcp"]),
    ).rejects.toThrow(/Invalid MCP server name/);
    await expect(spriteCli(["setup", "crew-claude-1", "--bogus"])).rejects.toThrow(
      /Unknown sprite setup argument/,
    );
  });

  it("rejects malformed or non-HTTPS MCP URLs", async () => {
    await expect(
      spriteCli(["setup", "crew-claude-1", "--mcp", "custom=http://example.com/mcp"]),
    ).rejects.toThrow(/Invalid MCP server URL/);
    await expect(
      spriteCli(["setup", "crew-claude-1", "--mcp", "custom=https:// invalid"]),
    ).rejects.toThrow(/Invalid MCP server URL/);
  });

  it("rejects unknown sprite actions", async () => {
    await expect(spriteCli(["unknown"])).rejects.toThrow(/crew sprite setup/);
  });

  it("lists sessions using the configured default sprite", async () => {
    const consoleLog = vi.spyOn(console, "log").mockReturnValue();
    runCommandMock.mockResolvedValue(
      [
        "ID         Command",
        "23001      claude --permission-m...",
        "",
        "To attach to a session:",
        "  sprite exec -id <session_id>",
        "",
      ].join("\n"),
    );

    await spriteCli(["sessions"]);

    expect(loadConfigMock).toHaveBeenCalledWith();
    expect(runCommandMock).toHaveBeenCalledWith(
      "sprite",
      ["sessions", "list", "-s", "crew-default"],
      { trim: false },
    );
    expect(consoleLog.mock.calls.join("\n")).toContain(
      "crew sprite attach <session_id> --sprite crew-default",
    );
    expect(consoleLog.mock.calls.join("\n")).toContain(
      "sprite sessions attach <session_id> -s crew-default",
    );
    expect(consoleLog.mock.calls.join("\n")).not.toContain("sprite exec -id");
  });

  it("lists sessions using an explicit sprite without loading config", async () => {
    const consoleLog = vi.spyOn(console, "log").mockReturnValue();
    runCommandMock.mockResolvedValue("No active sessions found.\n");

    await spriteCli(["sessions", "crew-claude-1"]);

    expect(loadConfigMock).not.toHaveBeenCalled();
    expect(runCommandMock).toHaveBeenCalledWith(
      "sprite",
      ["sessions", "list", "-s", "crew-claude-1"],
      { trim: false },
    );
    expect(consoleLog).toHaveBeenCalledWith("No active sessions found.");
  });

  it("attaches to a session using the configured default sprite", async () => {
    await spriteCli(["attach", "12345"]);

    expect(loadConfigMock).toHaveBeenCalledWith();
    expect(runCommandMock).toHaveBeenCalledWith(
      "sprite",
      ["attach", "-s", "crew-default", "12345"],
      { stdio: "inherit", timeoutMs: 0 },
    );
  });

  it("attaches to a command selector using an explicit sprite", async () => {
    await spriteCli(["attach", "bash", "--sprite", "crew-claude-1"]);

    expect(loadConfigMock).not.toHaveBeenCalled();
    expect(runCommandMock).toHaveBeenCalledWith(
      "sprite",
      ["attach", "-s", "crew-claude-1", "bash"],
      { stdio: "inherit", timeoutMs: 0 },
    );
  });

  it("lists remote processes using an explicit sprite", async () => {
    const consoleLog = vi.spyOn(console, "log").mockReturnValue();
    runCommandMock.mockResolvedValue("PID PPID PGID CMD\n23001 0 23001 claude\n");

    await spriteCli(["ps", "crew-claude-1"]);

    expect(loadConfigMock).not.toHaveBeenCalled();
    expect(runCommandMock).toHaveBeenCalledWith(
      "sprite",
      [
        "exec",
        "-s",
        "crew-claude-1",
        "--",
        "ps",
        "-eo",
        "pid,ppid,pgid,sid,stat,etime,pcpu,pmem,cmd",
      ],
      { trim: false },
    );
    expect(consoleLog).toHaveBeenCalledWith("PID PPID PGID CMD\n23001 0 23001 claude");
  });

  it("interrupts a selected remote process group using the configured default sprite", async () => {
    await spriteCli(["interrupt", "27673"]);

    expect(loadConfigMock).toHaveBeenCalledWith();
    expect(runCommandMock).toHaveBeenCalledWith(
      "sprite",
      ["exec", "-s", "crew-default", "--", "kill", "-INT", "--", "-27673"],
      { stdio: "inherit" },
    );
  });

  it("interrupts a selected remote process group using an explicit sprite", async () => {
    await spriteCli(["interrupt", "27673", "--sprite", "crew-claude-1"]);

    expect(loadConfigMock).not.toHaveBeenCalled();
    expect(runCommandMock).toHaveBeenCalledWith(
      "sprite",
      ["exec", "-s", "crew-claude-1", "--", "kill", "-INT", "--", "-27673"],
      { stdio: "inherit" },
    );
  });

  it("rejects missing targets and unknown session wrapper flags before running sprite", async () => {
    await expect(spriteCli(["attach"])).rejects.toThrow(/Usage:/);
    await expect(spriteCli(["attach", "12345", "--bogus"])).rejects.toThrow(/Usage:/);
    await expect(spriteCli(["sessions", "--bogus"])).rejects.toThrow(/Usage:/);
    await expect(spriteCli(["ps", "--bogus"])).rejects.toThrow(/Usage:/);
    await expect(spriteCli(["interrupt"])).rejects.toThrow(/Usage:/);
    await expect(spriteCli(["interrupt", "0"])).rejects.toThrow(/Usage:/);
    await expect(spriteCli(["interrupt", "abc"])).rejects.toThrow(/Usage:/);
    await expect(spriteCli(["interrupt", "27673", "--bogus"])).rejects.toThrow(/Usage:/);

    expect(runCommandMock).not.toHaveBeenCalled();
  });

  it("parses setup options for selected agent auth, git identity, and checkpoint", async () => {
    const codexStatusCalls = mockSpriteListWithCodexStatus({ failuresBeforeSuccess: 1 });

    await spriteCli([
      "setup",
      "crew-claude-1",
      "--claude",
      "--codex",
      "--github",
      "--git-name",
      "Rocky Warren",
      "--git-email",
      "1085683+therockstorm@users.noreply.github.com",
      "--checkpoint",
      "--checkpoint-comment",
      "custom baseline",
      "--no-create",
    ]);

    expect(runCommandMock).toHaveBeenCalledWith(
      "sprite",
      expect.arrayContaining(["git", "config", "--global", "user.name", "Rocky Warren"]),
    );
    expect(runCommandMock).toHaveBeenCalledWith(
      "sprite",
      expect.arrayContaining([
        "git",
        "config",
        "--global",
        "user.email",
        "1085683+therockstorm@users.noreply.github.com",
      ]),
    );
    expect(runCommandMock).toHaveBeenCalledWith(
      "sprite",
      expect.arrayContaining(["gh", "auth", "setup-git"]),
    );
    expect(runCommandMock).toHaveBeenCalledWith(
      "sprite",
      expect.arrayContaining(["codex", "login"]),
      { stdio: "inherit", timeoutMs: 0 },
    );
    expect(runCommandMock).toHaveBeenCalledWith(
      "sprite",
      ["checkpoint", "create", "-s", "crew-claude-1", "--comment", "custom baseline"],
      { stdio: "inherit", timeoutMs: 0 },
    );
    expect(codexStatusCalls()).toBe(2);
  });

  it("skips adding MCP servers that already exist", async () => {
    mockSpriteListWithExistingMcp("NAME STATUS\ncrew-claude-1 running");

    await spriteCli(["setup", "crew-claude-1", "--mcp", "linear", "--skip-mcp-auth"]);

    expect(
      runCommandMock.mock.calls.some((call) =>
        hasRemoteCommand(call, ["claude", "mcp", "add", "linear"]),
      ),
    ).toBe(false);
  });

  it("dispatches bootstrap with branch and selected build secrets", async () => {
    mockExistingSpriteForBootstrap();
    vi.stubEnv("NPM_TOKEN", "npm-token");
    vi.stubEnv("BUF_TOKEN", "buf-token");

    await spriteCli([
      "bootstrap",
      "crew-claude-1",
      "core-utils",
      "--branch",
      "rocky-team-123",
      "--secret",
      "NPM_TOKEN",
      "--secret",
      "BUF_TOKEN",
    ]);

    expect(runCommandMock).toHaveBeenCalledWith(
      "sprite",
      expect.arrayContaining(["exec", "-s", "crew-claude-1", "--", "bash", "-lc"]),
      { stdio: "inherit", timeoutMs: 0 },
    );
    const bootstrapCall = runCommandMock.mock.calls.find((call) =>
      hasRemoteCommand(call, ["bash", "-lc"]),
    );
    expect(bootstrapCall?.[1]).toStrictEqual(
      expect.arrayContaining(["--file", expect.stringMatching(/secrets\.env:/)]),
    );
    const command = bootstrapCall?.[1]?.at(-1);
    expect(command).toStrictEqual(
      expect.stringContaining("gh repo clone 'ClipboardHealth/core-utils' \"$repo_dir\""),
    );
    expect(command).toStrictEqual(expect.stringContaining('repo_dir="$HOME/dev/core-utils"'));
    expect(command).toStrictEqual(expect.stringContaining("git fetch origin --prune"));
    expect(command).toStrictEqual(
      expect.stringContaining("git checkout -B 'rocky-team-123' 'origin/rocky-team-123'"),
    );
    expect(command).toStrictEqual(
      expect.stringContaining("git checkout -B 'rocky-team-123' 'origin/main'"),
    );
    expect(command).toStrictEqual(expect.stringContaining("unset NPM_TOKEN BUF_TOKEN"));
    expect(command).toStrictEqual(expect.stringContaining("./.claude/setup.sh --deps-only"));
  });
});

describe(setupSprite, () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("creates a missing sprite, authenticates requested tools, configures git, and checkpoints", async () => {
    mockMissingSpriteWithMissingAgentAuth();

    await setupSprite({
      spriteName: "crew-claude-1",
      shouldCreate: true,
      shouldAuthenticateClaude: true,
      shouldAuthenticateCodex: false,
      shouldAuthenticateGithub: true,
      shouldAuthenticateMcp: true,
      shouldCheckpoint: true,
      checkpointComment: "baseline",
      gitName: "Rocky Warren",
      gitEmail: "1085683+therockstorm@users.noreply.github.com",
      mcpServers: [],
    });

    expect(runCommandMock).toHaveBeenCalledWith(
      "sprite",
      ["create", "--skip-console", "crew-claude-1"],
      { stdio: "inherit", timeoutMs: 0 },
    );
    expect(runCommandMock).toHaveBeenCalledWith(
      "sprite",
      expect.arrayContaining(["git", "config", "--global", "user.name", "Rocky Warren"]),
    );
    expect(runCommandMock).toHaveBeenCalledWith(
      "sprite",
      expect.arrayContaining([
        "git",
        "config",
        "--global",
        "user.email",
        "1085683+therockstorm@users.noreply.github.com",
      ]),
    );
    expect(runCommandMock).toHaveBeenCalledWith(
      "sprite",
      expect.arrayContaining(["gh", "auth", "login", "-h", "github.com", "-p", "https", "-w"]),
      { stdio: "inherit", timeoutMs: 0 },
    );
    expect(runCommandMock).toHaveBeenCalledWith(
      "sprite",
      [
        "exec",
        "--tty",
        "-s",
        "crew-claude-1",
        "--",
        "claude",
        "auth",
        "login",
        CLAUDE_SUBSCRIPTION_LOGIN_FLAG,
      ],
      { stdio: "inherit", timeoutMs: 0 },
    );
    expect(runCommandMock).toHaveBeenCalledWith(
      "sprite",
      ["checkpoint", "create", "-s", "crew-claude-1", "--comment", "baseline"],
      { stdio: "inherit", timeoutMs: 0 },
    );
  });

  it("rejects missing sprites when creation is disabled", async () => {
    mockSpriteList("");

    await expect(
      setupSprite({
        spriteName: "missing",
        shouldCreate: false,
        shouldAuthenticateClaude: false,
        shouldAuthenticateCodex: false,
        shouldAuthenticateGithub: false,
        shouldAuthenticateMcp: false,
        shouldCheckpoint: false,
        checkpointComment: "",
        mcpServers: [],
      }),
    ).rejects.toThrow(/does not exist and --no-create was set/);
  });

  it("authenticates codex when requested", async () => {
    const codexStatusCalls = mockSpriteListWithCodexStatus({ failuresBeforeSuccess: 1 });

    await setupSprite({
      spriteName: "crew-claude-1",
      shouldCreate: false,
      shouldAuthenticateClaude: false,
      shouldAuthenticateCodex: true,
      shouldAuthenticateGithub: false,
      shouldAuthenticateMcp: false,
      shouldCheckpoint: false,
      checkpointComment: "",
      mcpServers: [],
    });

    expect(runCommandMock).toHaveBeenCalledWith(
      "sprite",
      expect.arrayContaining(["codex", "login"]),
      { stdio: "inherit", timeoutMs: 0 },
    );
    expect(codexStatusCalls()).toBe(2);
  });

  it("skips codex auth when status is already valid", async () => {
    mockSpriteList("NAME STATUS\ncrew-claude-1 running");

    await setupSprite({
      spriteName: "crew-claude-1",
      shouldCreate: false,
      shouldAuthenticateClaude: false,
      shouldAuthenticateCodex: true,
      shouldAuthenticateGithub: false,
      shouldAuthenticateMcp: false,
      shouldCheckpoint: false,
      checkpointComment: "",
      mcpServers: [],
    });

    expect(runCommandMock.mock.calls.some(isInteractiveCodexLoginCall)).toBe(false);
  });

  it("copies local codex auth when requested and validates it", async () => {
    const temporaryCodexHome = mkdtempSync(join(tmpdir(), "groundcrew-codex-home-"));
    const localAuthFile = join(temporaryCodexHome, "auth.json");
    writeFileSync(localAuthFile, JSON.stringify({ token: "redacted" }));
    vi.stubEnv("CODEX_HOME", temporaryCodexHome);
    const codexStatusCalls = mockSpriteListWithCodexStatus({ failuresBeforeSuccess: 1 });

    try {
      await spriteCli([
        "setup",
        "crew-claude-1",
        "--codex",
        "--copy-local-codex-auth",
        "--no-create",
      ]);
    } finally {
      rmSync(temporaryCodexHome, { recursive: true, force: true });
    }

    expect(runCommandMock).toHaveBeenCalledWith(
      "sprite",
      expect.arrayContaining(["--file", `${localAuthFile}:/tmp/groundcrew-codex-auth.json`]),
    );
    const copyCall = runCommandMock.mock.calls.find((call) =>
      call[1].includes(`${localAuthFile}:/tmp/groundcrew-codex-auth.json`),
    );
    const command = copyCall?.[1].at(-1);
    expect(command).toStrictEqual(expect.stringContaining("/home/sprite/.codex/auth.json"));
    expect(command).toStrictEqual(expect.stringContaining("install -m 600"));
    expect(command).toStrictEqual(
      expect.stringContaining("rm -f '/tmp/groundcrew-codex-auth.json'"),
    );
    expect(codexStatusCalls()).toBe(2);
  });

  it("rejects copy-local-codex-auth when the local auth file is missing", async () => {
    const temporaryCodexHome = mkdtempSync(join(tmpdir(), "groundcrew-codex-home-"));
    vi.stubEnv("CODEX_HOME", temporaryCodexHome);
    mockSpriteListWithCodexStatus({ alwaysFail: true });

    try {
      await expect(
        spriteCli(["setup", "crew-claude-1", "--codex", "--copy-local-codex-auth", "--no-create"]),
      ).rejects.toThrow(/Local Codex auth file not found/);
    } finally {
      rmSync(temporaryCodexHome, { recursive: true, force: true });
    }
  });

  it("fails when copied codex auth still does not validate", async () => {
    const temporaryCodexHome = mkdtempSync(join(tmpdir(), "groundcrew-codex-home-"));
    writeFileSync(join(temporaryCodexHome, "auth.json"), JSON.stringify({ token: "redacted" }));
    vi.stubEnv("CODEX_HOME", temporaryCodexHome);
    mockSpriteListWithCodexStatus({ alwaysFail: true });

    try {
      await expect(
        spriteCli(["setup", "crew-claude-1", "--codex", "--copy-local-codex-auth", "--no-create"]),
      ).rejects.toThrow(/Codex auth copy completed/);
    } finally {
      rmSync(temporaryCodexHome, { recursive: true, force: true });
    }
  });

  it("fails with copy-auth guidance when codex login still does not validate", async () => {
    mockSpriteListWithCodexStatus({ alwaysFail: true });

    await expect(
      setupSprite({
        spriteName: "crew-claude-1",
        shouldCreate: false,
        shouldAuthenticateClaude: false,
        shouldAuthenticateCodex: true,
        shouldCopyLocalCodexAuth: false,
        shouldAuthenticateGithub: false,
        shouldAuthenticateMcp: false,
        shouldCheckpoint: false,
        checkpointComment: "",
        mcpServers: [],
      }),
    ).rejects.toThrow(/copy-local-codex-auth/);
  });
});

describe(bootstrapSpriteRepository, () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it("does not upload a secrets file when secrets are disabled", async () => {
    mockExistingSpriteForBootstrap();

    await bootstrapSpriteRepository({
      spriteName: "crew-claude-1",
      repository: "ClipboardHealth/core-utils",
      owner: "ClipboardHealth",
      baseBranch: "main",
      secretNames: [],
      shouldRequireSelectedSecrets: false,
      shouldUseSecrets: false,
    });

    expect(runCommandMock).toHaveBeenCalledWith("sprite", expect.not.arrayContaining(["--file"]), {
      stdio: "inherit",
      timeoutMs: 0,
    });
  });

  it("skips unset optional build secrets without uploading a file", async () => {
    mockExistingSpriteForBootstrap();
    vi.stubEnv("NPM_TOKEN", "");
    vi.stubEnv("BUF_TOKEN", "");

    await bootstrapSpriteRepository({
      spriteName: "crew-claude-1",
      repository: "core-utils",
      owner: "ClipboardHealth",
      baseBranch: "main",
      secretNames: ["NPM_TOKEN", "BUF_TOKEN"],
      shouldRequireSelectedSecrets: false,
      shouldUseSecrets: true,
    });

    expect(runCommandMock).toHaveBeenCalledWith("sprite", expect.not.arrayContaining(["--file"]), {
      stdio: "inherit",
      timeoutMs: 0,
    });
  });

  it("uploads populated optional build secrets while skipping unset ones", async () => {
    mockExistingSpriteForBootstrap();
    vi.stubEnv("NPM_TOKEN", "npm-token");
    vi.stubEnv("BUF_TOKEN", "");

    await bootstrapSpriteRepository({
      spriteName: "crew-claude-1",
      repository: "core-utils",
      owner: "ClipboardHealth",
      baseBranch: "main",
      secretNames: ["NPM_TOKEN", "BUF_TOKEN"],
      shouldRequireSelectedSecrets: false,
      shouldUseSecrets: true,
    });

    const bootstrapCall = runCommandMock.mock.calls.find((call) =>
      hasRemoteCommand(call, ["bash", "-lc"]),
    );
    expect(bootstrapCall?.[1]).toStrictEqual(
      expect.arrayContaining(["--file", expect.stringMatching(/secrets\.env:/)]),
    );
  });

  it("parses bootstrap base, owner, and no-secrets options", async () => {
    mockExistingSpriteForBootstrap();

    await spriteCli([
      "bootstrap",
      "crew-claude-1",
      "core-utils",
      "--base",
      "develop",
      "--owner",
      "ClipboardHealth",
      "--no-secrets",
    ]);

    const bootstrapCall = runCommandMock.mock.calls.find((call) =>
      hasRemoteCommand(call, ["bash", "-lc"]),
    );
    expect(bootstrapCall?.[1]).toStrictEqual(expect.not.arrayContaining(["--file"]));
    expect(bootstrapCall?.[1]?.at(-1)).toStrictEqual(
      expect.stringContaining("git checkout -B 'develop' 'origin/develop'"),
    );
  });

  it("strips .git suffixes when choosing the remote repository directory", async () => {
    mockExistingSpriteForBootstrap();

    await bootstrapSpriteRepository({
      spriteName: "crew-claude-1",
      repository: "core-utils.git",
      owner: "ClipboardHealth",
      baseBranch: "main",
      secretNames: [],
      shouldRequireSelectedSecrets: false,
      shouldUseSecrets: false,
    });

    const bootstrapCall = runCommandMock.mock.calls.find((call) =>
      hasRemoteCommand(call, ["bash", "-lc"]),
    );
    expect(bootstrapCall?.[1]?.at(-1)).toStrictEqual(
      expect.stringContaining('repo_dir="$HOME/dev/core-utils"'),
    );
  });

  it("rejects invalid bootstrap arguments before running remote setup", async () => {
    await expect(spriteCli(["bootstrap"])).rejects.toThrow(/Usage:/);
    await expect(spriteCli(["bootstrap", "crew-claude-1", "a/b/c"])).rejects.toThrow(
      /Invalid repository/,
    );
    await expect(
      spriteCli(["bootstrap", "crew-claude-1", "core-utils", "--branch", "..bad"]),
    ).rejects.toThrow(/Invalid branch/);
    await expect(
      spriteCli(["bootstrap", "crew-claude-1", "core-utils", "--owner", "bad owner"]),
    ).rejects.toThrow(/Invalid repository owner/);
    await expect(
      spriteCli(["bootstrap", "crew-claude-1", "core-utils", "--secret", "bad-secret"]),
    ).rejects.toThrow(/Invalid secret name/);
    await expect(
      spriteCli(["bootstrap", "crew-claude-1", "core-utils", "--bogus"]),
    ).rejects.toThrow(/Unknown sprite bootstrap argument/);
  });

  it("requires explicitly selected secrets to exist locally", async () => {
    mockExistingSpriteForBootstrap();

    await expect(
      bootstrapSpriteRepository({
        spriteName: "crew-claude-1",
        repository: "core-utils",
        owner: "ClipboardHealth",
        baseBranch: "main",
        secretNames: ["NPM_TOKEN"],
        shouldRequireSelectedSecrets: true,
        shouldUseSecrets: true,
      }),
    ).rejects.toThrow(/NPM_TOKEN is not set/);
  });

  it("rejects missing sprites before staging or bootstrapping", async () => {
    runCommandMock.mockResolvedValue("");

    await expect(
      bootstrapSpriteRepository({
        spriteName: "missing",
        repository: "core-utils",
        owner: "ClipboardHealth",
        baseBranch: "main",
        secretNames: ["NPM_TOKEN"],
        shouldRequireSelectedSecrets: false,
        shouldUseSecrets: true,
      }),
    ).rejects.toThrow(/Sprite missing does not exist/);
  });
});
