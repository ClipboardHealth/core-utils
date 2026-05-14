import type { RunCommandOptions } from "../lib/commandRunner.ts";
import { bootstrapSpriteRepository, setupSprite, spriteCli } from "./spriteSetup.ts";

type RunCommandAsyncMock = (
  command: string,
  arguments_: readonly string[],
  options?: RunCommandOptions,
) => Promise<string | undefined>;

const runCommandMock = vi.hoisted(() => vi.fn<RunCommandAsyncMock>());
const CLAUDE_SUBSCRIPTION_LOGIN_FLAG = ["--claude", "ai"].join("");

vi.mock(import("../lib/commandRunner.ts"), async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- test mock records calls across runCommandAsync overloads.
    runCommandAsync: runCommandMock as unknown as typeof actual.runCommandAsync,
  };
});

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

describe(spriteCli, () => {
  beforeEach(() => {
    mockSpriteList("NAME STATUS\ncrew-claude-1 running");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
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
    await expect(spriteCli(["unknown"])).rejects.toThrow(/Usage: crew sprite/);
  });

  it("parses setup options for selected agent auth, git identity, and checkpoint", async () => {
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

    expect(runCommandMock).toHaveBeenCalledWith(
      "sprite",
      expect.arrayContaining(["codex", "login"]),
      { stdio: "inherit", timeoutMs: 0 },
    );
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
