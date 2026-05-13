import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import type * as nodeOs from "node:os";
import { tmpdir, userInfo } from "node:os";
import { join, sep } from "node:path";

import { probeError } from "../testHelpers/workspaceProbe.ts";
import type { RunCommandOptions } from "./commandRunner.ts";
import type { ResolvedConfig } from "./config.ts";
import { workspaces } from "./workspaces.ts";
import { type WorktreeEntry, worktrees } from "./worktrees.ts";

const { create, findByBranch, findByTicket, list, remove, teardown } = worktrees;

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
vi.mock(import("./workspaces.ts"), async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    workspaces: {
      open: vi.fn<typeof actual.workspaces.open>(),
      probe: vi.fn<typeof actual.workspaces.probe>(),
      close: vi.fn<typeof actual.workspaces.close>(),
    },
  };
});
// oxlint-disable-next-line jest/no-untyped-mock-factory -- typed dynamic imports conflict with Node builtin module typings
vi.mock("node:os", async (importOriginal) => {
  const actual = await importOriginal<typeof nodeOs>();
  return { ...actual, userInfo: vi.fn<typeof actual.userInfo>(actual.userInfo) };
});

const userInfoMock = vi.mocked(userInfo);

function makeConfig(overrides: {
  projectDir: string;
  knownRepositories?: string[];
  models?: ResolvedConfig["models"]["definitions"];
}): ResolvedConfig {
  const knownRepositories = overrides.knownRepositories ?? ["repo-a"];
  const models = overrides.models ?? { claude: { cmd: "claude", color: "#fff" } };
  return {
    linear: {
      projectSlug: "x-aaaaaaaaaaaa",
      slugId: "aaaaaaaaaaaa",
      statuses: { todo: "Todo", inProgress: "In Progress", done: "Done", terminal: ["Done"] },
    },
    git: { remote: "origin", defaultBranch: "main" },
    workspace: {
      projectDir: overrides.projectDir,
      knownRepositories,
    },
    orchestrator: {
      maximumInProgress: 4,
      pollIntervalMilliseconds: 1000,
      sessionLimitPercentage: 85,
    },
    models: { default: "claude", isolation: "auto", definitions: models },
    prompts: { initial: "x" },
    workspaceKind: "auto",
    logging: { file: "/tmp/groundcrew-test.log" },
  };
}

function makeUserInfo(username: string): ReturnType<typeof userInfo> {
  return { username, uid: 0, gid: 0, shell: null, homedir: "/tmp" };
}

let projectDir: string;

function setupTempProjectDir(): void {
  beforeEach(() => {
    projectDir = mkdtempSync(join(tmpdir(), "groundcrew-worktrees-"));
    userInfoMock.mockReturnValue(makeUserInfo("rocky"));
    runCommandMock.mockReturnValue("");
  });

  afterEach(() => {
    rmSync(projectDir, { recursive: true, force: true });
    vi.clearAllMocks();
  });
}

describe(list, () => {
  setupTempProjectDir();

  it("returns an empty list when the project directory is empty", () => {
    const config = makeConfig({ projectDir });

    expect(list(config)).toStrictEqual([]);
  });

  it("returns an empty list when the project directory cannot be read", () => {
    const config = makeConfig({ projectDir: join(projectDir, "does-not-exist") });

    expect(list(config)).toStrictEqual([]);
  });

  it("ignores non-directory entries in the project root", () => {
    writeFileSync(join(projectDir, "stray-file"), "");
    mkdirSync(join(projectDir, "repo-a-team-1"));
    const config = makeConfig({ projectDir });

    const actual = list(config);

    expect(actual.map((entry) => entry.dir)).toStrictEqual([join(projectDir, "repo-a-team-1")]);
  });

  it("finds host sibling worktrees by their <repo>-<ticket> naming", () => {
    mkdirSync(join(projectDir, "repo-a"));
    mkdirSync(join(projectDir, "repo-a-team-1"));
    const config = makeConfig({ projectDir });

    expect(list(config)).toStrictEqual([
      {
        repository: "repo-a",
        ticket: "team-1",
        branchName: "rocky-team-1",
        dir: join(projectDir, "repo-a-team-1"),
        kind: "host",
      },
    ]);
  });

  it("ignores host directories whose <repo> segment is not configured", () => {
    mkdirSync(join(projectDir, "ghost-team-1"));
    const config = makeConfig({ projectDir });

    expect(list(config)).toStrictEqual([]);
  });

  it("finds sandbox worktrees under each repo's .sbx/-worktrees/", () => {
    const repoDir = join(projectDir, "repo-a");
    const sandboxRoot = join(repoDir, ".sbx", "groundcrew-repo-a-claude-worktrees");
    mkdirSync(sandboxRoot, { recursive: true });
    mkdirSync(join(sandboxRoot, "rocky-team-1"));
    const config = makeConfig({
      projectDir,
      models: { claude: { cmd: "claude", color: "#fff", sandbox: { agent: "claude" } } },
    });

    expect(list(config)).toStrictEqual([
      {
        repository: "repo-a",
        ticket: "team-1",
        branchName: "rocky-team-1",
        dir: join(sandboxRoot, "rocky-team-1"),
        kind: "sandbox",
        sandboxName: "groundcrew-repo-a-claude",
      },
    ]);
  });

  it("ignores non-directory entries and non-matching names inside sandbox roots", () => {
    const sandboxRoot = join(projectDir, "repo-a", ".sbx", "groundcrew-repo-a-claude-worktrees");
    mkdirSync(sandboxRoot, { recursive: true });
    mkdirSync(join(sandboxRoot, "rocky-team-1"));
    mkdirSync(join(sandboxRoot, "not-a-ticket"));
    writeFileSync(join(sandboxRoot, "stray-file"), "");
    const config = makeConfig({
      projectDir,
      models: { claude: { cmd: "claude", color: "#fff", sandbox: { agent: "claude" } } },
    });

    const actual = list(config);

    expect(actual.map((entry) => entry.dir)).toStrictEqual([join(sandboxRoot, "rocky-team-1")]);
  });

  it("returns BOTH kinds when the same ticket has a host and a sandbox worktree", () => {
    const repoDir = join(projectDir, "repo-a");
    mkdirSync(repoDir);
    mkdirSync(join(projectDir, "repo-a-team-1"));
    const sandboxRoot = join(repoDir, ".sbx", "groundcrew-repo-a-claude-worktrees");
    mkdirSync(sandboxRoot, { recursive: true });
    mkdirSync(join(sandboxRoot, "rocky-team-1"));
    const config = makeConfig({
      projectDir,
      models: { claude: { cmd: "claude", color: "#fff", sandbox: { agent: "claude" } } },
    });

    const actual = list(config);

    expect(actual).toHaveLength(2);
    expect(actual.map((entry) => entry.kind).toSorted()).toStrictEqual(["host", "sandbox"]);
    expect(actual.every((entry) => entry.ticket === "team-1")).toBe(true);
  });
});

describe(findByTicket, () => {
  setupTempProjectDir();

  it("returns every entry matching the ticket regardless of repo or kind", () => {
    const repoDir = join(projectDir, "repo-a");
    mkdirSync(repoDir);
    mkdirSync(join(projectDir, "repo-a-team-1"));
    const sandboxRoot = join(repoDir, ".sbx", "groundcrew-repo-a-claude-worktrees");
    mkdirSync(sandboxRoot, { recursive: true });
    mkdirSync(join(sandboxRoot, "rocky-team-1"));
    const config = makeConfig({
      projectDir,
      models: { claude: { cmd: "claude", color: "#fff", sandbox: { agent: "claude" } } },
    });

    const actual = findByTicket(config, "team-1");

    expect(actual).toHaveLength(2);
  });

  it("returns an empty array when the ticket has no worktree", () => {
    const config = makeConfig({ projectDir });

    expect(findByTicket(config, "team-99")).toStrictEqual([]);
  });
});

describe(findByBranch, () => {
  setupTempProjectDir();

  it("matches a host worktree by branch name", () => {
    mkdirSync(join(projectDir, "repo-a-team-1"));
    const config = makeConfig({ projectDir });

    const actual = findByBranch(config, "repo-a", "rocky-team-1");

    expect(actual?.kind).toBe("host");
    expect(actual?.dir).toBe(join(projectDir, "repo-a-team-1"));
  });

  it("matches a sandbox worktree by branch name", () => {
    const sandboxRoot = join(projectDir, "repo-a", ".sbx", "groundcrew-repo-a-claude-worktrees");
    mkdirSync(sandboxRoot, { recursive: true });
    mkdirSync(join(sandboxRoot, "rocky-team-1"));
    const config = makeConfig({
      projectDir,
      models: { claude: { cmd: "claude", color: "#fff", sandbox: { agent: "claude" } } },
    });

    const actual = findByBranch(config, "repo-a", "rocky-team-1");

    expect(actual?.kind).toBe("sandbox");
    expect(actual?.sandboxName).toBe("groundcrew-repo-a-claude");
  });

  it("returns undefined when no branch matches", () => {
    const config = makeConfig({ projectDir });

    expect(findByBranch(config, "repo-a", "rocky-team-999")).toBeUndefined();
  });
});

describe(create, () => {
  setupTempProjectDir();

  function mockSandboxLs(sandboxName: string): void {
    runCommandMock.mockImplementation((cmd, arguments_) => {
      if (cmd === "sbx" && arguments_[0] === "ls") {
        return `SANDBOX AGENT STATUS\n${sandboxName} claude stopped\n`;
      }
      return "";
    });
  }

  it("fetches origin/main then runs git worktree add for the host strategy", async () => {
    mkdirSync(join(projectDir, "repo-a"));
    const config = makeConfig({ projectDir });

    const actual = await create(config, {
      repository: "repo-a",
      ticket: "team-1",
      model: "claude",
      strategy: "none",
    });

    expect(runCommandMock).toHaveBeenCalledWith(
      "git",
      ["-C", join(projectDir, "repo-a"), "fetch", "origin", "main"],
      { stdio: "inherit", timeoutMs: 0 },
    );
    expect(runCommandMock).toHaveBeenCalledWith(
      "git",
      [
        "-C",
        join(projectDir, "repo-a"),
        "worktree",
        "add",
        "-b",
        "rocky-team-1",
        join(projectDir, "repo-a-team-1"),
        "origin/main",
      ],
      { stdio: "inherit", timeoutMs: 0 },
    );
    expect(actual.kind).toBe("host");
    expect(actual.dir).toBe(join(projectDir, "repo-a-team-1"));
  });

  it("runs sbx run --branch for the docker strategy and skips the host fetch", async () => {
    mkdirSync(join(projectDir, "repo-a"));
    const config = makeConfig({
      projectDir,
      models: { claude: { cmd: "claude", color: "#fff", sandbox: { agent: "claude" } } },
    });
    mockSandboxLs("groundcrew-repo-a-claude");

    const actual = await create(config, {
      repository: "repo-a",
      ticket: "team-1",
      model: "claude",
      strategy: "docker",
    });

    expect(runCommandMock).toHaveBeenCalledWith(
      "sbx",
      ["run", "--branch", "rocky-team-1", "groundcrew-repo-a-claude", "--", "--version"],
      { stdio: "inherit", timeoutMs: 0 },
    );
    expect(runCommandMock).not.toHaveBeenCalledWith(
      "git",
      expect.arrayContaining(["fetch"]),
      expect.anything(),
    );
    expect(actual.kind).toBe("sandbox");
    expect(actual.sandboxName).toBe("groundcrew-repo-a-claude");
  });

  it("passes AbortSignal through sandbox existence and creation commands", async () => {
    mkdirSync(join(projectDir, "repo-a"));
    const { signal } = new AbortController();
    const config = makeConfig({
      projectDir,
      models: { claude: { cmd: "claude", color: "#fff", sandbox: { agent: "claude" } } },
    });
    mockSandboxLs("groundcrew-repo-a-claude");

    await create(
      config,
      { repository: "repo-a", ticket: "team-1", model: "claude", strategy: "docker" },
      signal,
    );

    expect(runCommandMock).toHaveBeenCalledWith("sbx", ["ls"], { signal });
    expect(runCommandMock).toHaveBeenCalledWith(
      "sbx",
      ["run", "--branch", "rocky-team-1", "groundcrew-repo-a-claude", "--", "--version"],
      { stdio: "inherit", timeoutMs: 0, signal },
    );
  });

  it("rejects the docker strategy when the persistent sandbox is missing", async () => {
    mkdirSync(join(projectDir, "repo-a"));
    const config = makeConfig({
      projectDir,
      models: { claude: { cmd: "claude", color: "#fff", sandbox: { agent: "claude" } } },
    });
    // Default mock returns "" for `sbx ls`, so sandboxExists returns false.

    await expect(
      create(config, {
        repository: "repo-a",
        ticket: "team-1",
        model: "claude",
        strategy: "docker",
      }),
    ).rejects.toThrow(/crew sandbox auth repo-a --model claude/);
    expect(runCommandMock).not.toHaveBeenCalledWith(
      "sbx",
      expect.arrayContaining(["run", "--branch"]),
      expect.anything(),
    );
  });

  it("rejects when a host worktree already exists for the same ticket", async () => {
    mkdirSync(join(projectDir, "repo-a"));
    mkdirSync(join(projectDir, "repo-a-team-1"));
    const config = makeConfig({ projectDir });

    await expect(
      create(config, {
        repository: "repo-a",
        ticket: "team-1",
        model: "claude",
        strategy: "none",
      }),
    ).rejects.toThrow(/already exists/);
  });

  it("rejects when a sandbox worktree already exists for the same ticket (cross-strategy)", async () => {
    const sandboxRoot = join(projectDir, "repo-a", ".sbx", "groundcrew-repo-a-claude-worktrees");
    mkdirSync(sandboxRoot, { recursive: true });
    mkdirSync(join(sandboxRoot, "rocky-team-1"));
    const config = makeConfig({
      projectDir,
      models: { claude: { cmd: "claude", color: "#fff", sandbox: { agent: "claude" } } },
    });

    // A user switching strategy mid-flight: now "none" but a sandbox dir
    // is left over. create() must refuse so we don't shadow the leftover.
    await expect(
      create(config, {
        repository: "repo-a",
        ticket: "team-1",
        model: "claude",
        strategy: "none",
      }),
    ).rejects.toThrow(/already exists/);
  });

  it("rejects the docker strategy when the model has no sandbox config", async () => {
    mkdirSync(join(projectDir, "repo-a"));
    const config = makeConfig({ projectDir });

    await expect(
      create(config, {
        repository: "repo-a",
        ticket: "team-1",
        model: "claude",
        strategy: "docker",
      }),
    ).rejects.toThrow(/no sandbox config/);
  });

  it("rejects unknown repositories", async () => {
    const config = makeConfig({ projectDir });

    await expect(
      create(config, {
        repository: "ghost",
        ticket: "team-1",
        model: "claude",
        strategy: "none",
      }),
    ).rejects.toThrow(/not in workspace.knownRepositories/);
  });

  it("throws when the repository directory does not exist", async () => {
    const config = makeConfig({ projectDir });

    await expect(
      create(config, {
        repository: "repo-a",
        ticket: "team-1",
        model: "claude",
        strategy: "none",
      }),
    ).rejects.toThrow(/Repository not found/);
  });

  it.each([
    ["empty string", ""],
    ["bare dot", "."],
    ["double dot", ".."],
    ["forward slash", "team/123"],
    ["backslash", String.raw`team\123`],
    ["embedded ..", "team-..-123"],
    ["traversal segment", `..${sep}evil`],
    ["wrong shape — no digits", "team-abc"],
    ["wrong shape — uppercase", "TEAM-123"],
    ["wrong shape — trailing whitespace", "team-123 "],
    ["wrong shape — plain word", "foo"],
  ])("rejects invalid ticket %s", async (_label, ticket) => {
    mkdirSync(join(projectDir, "repo-a"));
    const config = makeConfig({ projectDir });

    await expect(
      create(config, {
        repository: "repo-a",
        ticket,
        model: "claude",
        strategy: "none",
      }),
    ).rejects.toThrow(/must be a plain ticket id/);
  });

  it("throws when the OS username is empty", async () => {
    mkdirSync(join(projectDir, "repo-a"));
    userInfoMock.mockReturnValue(makeUserInfo(""));
    const config = makeConfig({ projectDir });

    await expect(
      create(config, {
        repository: "repo-a",
        ticket: "team-1",
        model: "claude",
        strategy: "none",
      }),
    ).rejects.toThrow(/Could not determine OS username/);
  });
});

describe(remove, () => {
  setupTempProjectDir();

  it("runs git worktree remove for a host entry whose dir exists", async () => {
    mkdirSync(join(projectDir, "repo-a"));
    mkdirSync(join(projectDir, "repo-a-team-1"));
    const config = makeConfig({ projectDir });

    await remove(config, {
      repository: "repo-a",
      ticket: "team-1",
      branchName: "rocky-team-1",
      dir: join(projectDir, "repo-a-team-1"),
      kind: "host",
    });

    expect(runCommandMock).toHaveBeenCalledWith(
      "git",
      ["-C", join(projectDir, "repo-a"), "worktree", "remove", join(projectDir, "repo-a-team-1")],
      { stdio: "inherit", timeoutMs: 0 },
    );
    expect(runCommandMock).toHaveBeenCalledWith("git", [
      "-C",
      join(projectDir, "repo-a"),
      "branch",
      "-D",
      "rocky-team-1",
    ]);
  });

  it("passes --force when force is set on a host entry", async () => {
    mkdirSync(join(projectDir, "repo-a"));
    mkdirSync(join(projectDir, "repo-a-team-1"));
    const config = makeConfig({ projectDir });

    await remove(
      config,
      {
        repository: "repo-a",
        ticket: "team-1",
        branchName: "rocky-team-1",
        dir: join(projectDir, "repo-a-team-1"),
        kind: "host",
      },
      { force: true },
    );

    expect(runCommandMock).toHaveBeenCalledWith(
      "git",
      [
        "-C",
        join(projectDir, "repo-a"),
        "worktree",
        "remove",
        "--force",
        join(projectDir, "repo-a-team-1"),
      ],
      { stdio: "inherit", timeoutMs: 0 },
    );
  });

  it("prunes when a host entry's directory is missing", async () => {
    mkdirSync(join(projectDir, "repo-a"));
    const config = makeConfig({ projectDir });

    await remove(config, {
      repository: "repo-a",
      ticket: "team-1",
      branchName: "rocky-team-1",
      dir: join(projectDir, "repo-a-team-1"),
      kind: "host",
    });

    expect(runCommandMock).toHaveBeenCalledWith(
      "git",
      ["-C", join(projectDir, "repo-a"), "worktree", "prune"],
      { stdio: "inherit", timeoutMs: 0 },
    );
    expect(runCommandMock).not.toHaveBeenCalledWith(
      "git",
      expect.arrayContaining(["worktree", "remove"]),
      expect.anything(),
    );
  });

  it("dispatches `sbx exec git worktree remove` for a sandbox entry", async () => {
    const sandboxRoot = join(projectDir, "repo-a", ".sbx", "groundcrew-repo-a-claude-worktrees");
    mkdirSync(sandboxRoot, { recursive: true });
    mkdirSync(join(sandboxRoot, "rocky-team-1"));
    const config = makeConfig({
      projectDir,
      models: { claude: { cmd: "claude", color: "#fff", sandbox: { agent: "claude" } } },
    });

    await remove(
      config,
      {
        repository: "repo-a",
        ticket: "team-1",
        branchName: "rocky-team-1",
        dir: join(sandboxRoot, "rocky-team-1"),
        kind: "sandbox",
        sandboxName: "groundcrew-repo-a-claude",
      },
      { force: true },
    );

    expect(runCommandMock).toHaveBeenCalledWith(
      "sbx",
      [
        "exec",
        "groundcrew-repo-a-claude",
        "git",
        "-C",
        join(projectDir, "repo-a"),
        "worktree",
        "remove",
        "--force",
        join(sandboxRoot, "rocky-team-1"),
      ],
      { stdio: "inherit", timeoutMs: 0 },
    );
    expect(runCommandMock).toHaveBeenCalledWith("sbx", [
      "exec",
      "groundcrew-repo-a-claude",
      "git",
      "-C",
      join(projectDir, "repo-a"),
      "branch",
      "-D",
      "rocky-team-1",
    ]);
  });

  it("does not throw when sandbox branch deletion fails", async () => {
    const sandboxRoot = join(projectDir, "repo-a", ".sbx", "groundcrew-repo-a-claude-worktrees");
    mkdirSync(sandboxRoot, { recursive: true });
    mkdirSync(join(sandboxRoot, "rocky-team-1"));
    const config = makeConfig({
      projectDir,
      models: { claude: { cmd: "claude", color: "#fff", sandbox: { agent: "claude" } } },
    });
    runCommandMock.mockImplementation((_cmd, arguments_) => {
      // oxlint-disable-next-line jest/no-conditional-in-test -- discriminator selects the branch-D call to fail; mirrors the real failure shape
      const includesBranchDelete = Array.isArray(arguments_) && arguments_.includes("-D");
      // oxlint-disable-next-line jest/no-conditional-in-test -- as above
      if (includesBranchDelete) {
        throw new Error("sbx exec failed");
      }
      return "";
    });

    const callRemove = async (): Promise<void> => {
      await remove(config, {
        repository: "repo-a",
        ticket: "team-1",
        branchName: "rocky-team-1",
        dir: join(sandboxRoot, "rocky-team-1"),
        kind: "sandbox",
        sandboxName: "groundcrew-repo-a-claude",
      });
    };

    await expect(callRemove()).resolves.toBeUndefined();
  });

  it("does not throw when host branch deletion fails", async () => {
    mkdirSync(join(projectDir, "repo-a"));
    mkdirSync(join(projectDir, "repo-a-team-1"));
    const config = makeConfig({ projectDir });
    runCommandMock.mockImplementation((_cmd, arguments_) => {
      // oxlint-disable-next-line jest/no-conditional-in-test -- discriminator selects the branch-D call to fail; mirrors the real branch-D failure shape
      const includesBranchDelete = Array.isArray(arguments_) && arguments_.includes("-D");
      // oxlint-disable-next-line jest/no-conditional-in-test -- as above
      if (includesBranchDelete) {
        throw new Error("branch missing");
      }
      return "";
    });

    const callRemove = async (): Promise<void> => {
      await remove(config, {
        repository: "repo-a",
        ticket: "team-1",
        branchName: "rocky-team-1",
        dir: join(projectDir, "repo-a-team-1"),
        kind: "host",
      });
    };

    await expect(callRemove()).resolves.toBeUndefined();
  });

  it("rethrows branch deletion failures after the shutdown signal fires", async () => {
    mkdirSync(join(projectDir, "repo-a"));
    mkdirSync(join(projectDir, "repo-a-team-1"));
    const controller = new AbortController();
    controller.abort();
    const config = makeConfig({ projectDir });
    runCommandMock.mockImplementation((_cmd, arguments_) => {
      // oxlint-disable-next-line jest/no-conditional-in-test -- this selects the best-effort branch cleanup command.
      if (Array.isArray(arguments_) && arguments_.includes("-D")) {
        throw new Error("interrupted branch delete");
      }
      return "";
    });

    await expect(
      remove(
        config,
        {
          repository: "repo-a",
          ticket: "team-1",
          branchName: "rocky-team-1",
          dir: join(projectDir, "repo-a-team-1"),
          kind: "host",
        },
        { signal: controller.signal },
      ),
    ).rejects.toThrow("interrupted branch delete");
  });
});

describe(teardown, () => {
  setupTempProjectDir();
  const workspacesProbeMock = vi.mocked(workspaces.probe);
  // oxlint-disable-next-line typescript/unbound-method -- vi.mocked needs the function reference
  const workspacesCloseMock = vi.mocked(workspaces.close);

  function hostEntry(ticket: string): WorktreeEntry {
    mkdirSync(join(projectDir, `repo-a-${ticket}`), { recursive: true });
    mkdirSync(join(projectDir, "repo-a"), { recursive: true });
    return {
      repository: "repo-a",
      ticket,
      branchName: `rocky-${ticket}`,
      dir: join(projectDir, `repo-a-${ticket}`),
      kind: "host",
    };
  }

  function sandboxEntry(ticket: string): WorktreeEntry {
    return {
      repository: "repo-a",
      ticket,
      branchName: `rocky-${ticket}`,
      dir: join(
        projectDir,
        "repo-a",
        ".sbx",
        "groundcrew-repo-a-claude-worktrees",
        `rocky-${ticket}`,
      ),
      kind: "sandbox",
      sandboxName: "groundcrew-repo-a-claude",
    };
  }

  it("short-circuits with an empty result when entries is empty (no workspaces.probe shell-out)", async () => {
    const config = makeConfig({ projectDir });

    const result = await teardown(config, []);

    expect(result).toStrictEqual({
      closed: [],
      removed: [],
      failures: [],
      workspaceProbe: { kind: "ok", names: new Set<string>() },
    });
    expect(workspacesProbeMock).not.toHaveBeenCalled();
  });

  it("closes the matching workspace before removing the worktree", async () => {
    workspacesProbeMock.mockResolvedValue({ kind: "ok", names: new Set(["team-1"]) });
    const config = makeConfig({ projectDir });
    const entry = hostEntry("team-1");

    await teardown(config, [entry]);

    expect(workspacesCloseMock).toHaveBeenCalledWith(expect.anything(), "team-1", undefined);
    expect(Number(workspacesCloseMock.mock.invocationCallOrder[0])).toBeLessThan(
      Number(runCommandMock.mock.invocationCallOrder[0]),
    );
  });

  it("dedupes the workspace close across host+sandbox kinds for one ticket", async () => {
    workspacesProbeMock.mockResolvedValue({ kind: "ok", names: new Set(["team-1"]) });
    const config = makeConfig({ projectDir });
    const entries = [hostEntry("team-1"), sandboxEntry("team-1")];

    const result = await teardown(config, entries);

    expect(workspacesCloseMock).toHaveBeenCalledTimes(1);
    expect(result.closed).toStrictEqual(["team-1"]);
    expect(result.removed).toHaveLength(2);
  });

  it("skips workspace close when the ticket is not in the live name set", async () => {
    workspacesProbeMock.mockResolvedValue({ kind: "ok", names: new Set<string>() });
    const config = makeConfig({ projectDir });

    const result = await teardown(config, [hostEntry("team-1")]);

    expect(workspacesCloseMock).not.toHaveBeenCalled();
    expect(result.closed).toStrictEqual([]);
    expect(result.removed).toHaveLength(1);
    expect(result.workspaceProbe.kind).toBe("ok");
  });

  it("surfaces workspaceProbe.kind=unavailable with no error when the probe reported no info", async () => {
    workspacesProbeMock.mockResolvedValue({ kind: "unavailable" });
    const config = makeConfig({ projectDir });

    const result = await teardown(config, [hostEntry("team-1")]);

    expect(result.workspaceProbe).toStrictEqual({ kind: "unavailable" });
    expect(result.removed).toHaveLength(1);
  });

  // Regression: a flaky cmux/tmux throwing from probe must not abort the
  // batch; otherwise every on-disk worktree gets stranded.
  it("captures the error on workspaceProbe and still removes every worktree", async () => {
    workspacesProbeMock.mockResolvedValue({
      kind: "unavailable",
      error: new Error("cmux exploded"),
    });
    const config = makeConfig({ projectDir });
    const entries = [hostEntry("team-1"), hostEntry("team-2")];

    const result = await teardown(config, entries);

    expect(result.workspaceProbe.kind).toBe("unavailable");
    expect(probeError(result.workspaceProbe)).toBeInstanceOf(Error);
    expect(workspacesCloseMock).not.toHaveBeenCalled();
    expect(result.removed).toHaveLength(2);
  });

  it("records workspace_close failures and continues to remove the worktree", async () => {
    workspacesProbeMock.mockResolvedValue({ kind: "ok", names: new Set(["team-1"]) });
    workspacesCloseMock.mockImplementation(() => {
      throw new Error("close down");
    });
    const config = makeConfig({ projectDir });
    const entry = hostEntry("team-1");

    const result = await teardown(config, [entry]);

    expect(result.failures).toHaveLength(1);
    expect(result.failures[0]?.entry).toBe(entry);
    expect(result.failures[0]?.step).toBe("workspace_close");
    expect(result.removed).toStrictEqual([entry]);
  });

  it("rethrows workspace_close failures after the shutdown signal fires", async () => {
    const controller = new AbortController();
    controller.abort();
    workspacesProbeMock.mockResolvedValue({ kind: "ok", names: new Set(["team-1"]) });
    workspacesCloseMock.mockRejectedValue(new Error("close interrupted"));
    const config = makeConfig({ projectDir });

    await expect(
      teardown(config, [hostEntry("team-1")], { signal: controller.signal }),
    ).rejects.toThrow("close interrupted");
  });

  it("records worktree_remove failures and continues to the next entry", async () => {
    workspacesProbeMock.mockResolvedValue({ kind: "ok", names: new Set<string>() });
    // The first runCommand fired by teardown is the `worktree remove` for
    // entry 1; subsequent calls (entry 1 branch -D, entry 2 remove + -D)
    // fall back to the beforeEach mockReturnValue.
    runCommandMock.mockImplementationOnce(() => {
      throw new Error("remove failed");
    });
    const config = makeConfig({ projectDir });
    const entries = [hostEntry("team-1"), hostEntry("team-2")];

    const result = await teardown(config, entries);

    expect(result.failures).toHaveLength(1);
    expect(result.failures[0]?.step).toBe("worktree_remove");
    expect(result.removed).toStrictEqual([entries[1]]);
  });

  it("rethrows worktree_remove failures after the shutdown signal fires", async () => {
    const controller = new AbortController();
    controller.abort();
    workspacesProbeMock.mockResolvedValue({ kind: "ok", names: new Set<string>() });
    runCommandMock.mockImplementationOnce(() => {
      throw new Error("remove interrupted");
    });
    const config = makeConfig({ projectDir });

    await expect(
      teardown(config, [hostEntry("team-1")], { signal: controller.signal }),
    ).rejects.toThrow("remove interrupted");
  });

  it("passes force through to the underlying remove", async () => {
    workspacesProbeMock.mockResolvedValue({ kind: "ok", names: new Set<string>() });
    const config = makeConfig({ projectDir });

    await teardown(config, [hostEntry("team-1")], { force: true });

    const allArguments = runCommandMock.mock.calls.flatMap(([, arguments_]) => arguments_);
    expect(allArguments).toContain("--force");
  });
});
