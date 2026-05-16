import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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
    models: { default: "claude", definitions: models },
    prompts: { initial: "x" },
    workspaceKind: "auto",
    logging: { file: "/tmp/groundcrew-test.log" },
    remote: {
      provider: "sprite",
      runnerName: "crew-claude-1",
      owner: "ClipboardHealth",
      repoRoot: "/home/sprite/dev",
      worktreeRoot: "/home/sprite/groundcrew/worktrees",
      secretNames: ["NPM_TOKEN", "BUF_TOKEN"],
    },
  };
}

function makeUserInfo(username: string): ReturnType<typeof userInfo> {
  return { username, uid: 0, gid: 0, shell: null, homedir: "/tmp" };
}

let projectDir: string;

function setupTempProjectDir(): void {
  beforeEach(() => {
    projectDir = mkdtempSync(join(tmpdir(), "groundcrew-worktrees-"));
    vi.stubEnv("XDG_STATE_HOME", join(projectDir, "state"));
    userInfoMock.mockReturnValue(makeUserInfo("rocky"));
    runCommandMock.mockReturnValue("");
  });

  afterEach(() => {
    rmSync(projectDir, { recursive: true, force: true });
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });
}

function remoteStatePath(): string {
  return join(projectDir, "state", "groundcrew", "remote-worktrees.json");
}

function writeRemoteState(entries: WorktreeEntry[]): void {
  mkdirSync(join(projectDir, "state", "groundcrew"), { recursive: true });
  writeFileSync(remoteStatePath(), `${JSON.stringify({ entries }, undefined, 2)}\n`);
}

function readRemoteStateEntries(): WorktreeEntry[] {
  return JSON.parse(readFileSync(remoteStatePath(), "utf8")).entries as WorktreeEntry[];
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

  it("ignores legacy .sbx worktree directories", () => {
    const repoDir = join(projectDir, "repo-a");
    const sandboxRoot = join(repoDir, ".sbx", "groundcrew-repo-a-claude-worktrees");
    mkdirSync(sandboxRoot, { recursive: true });
    mkdirSync(join(sandboxRoot, "rocky-team-1"));
    const config = makeConfig({ projectDir });

    expect(list(config)).toStrictEqual([]);
  });

  it("includes locally tracked remote worktrees", () => {
    const config = makeConfig({ projectDir });
    writeRemoteState([
      {
        repository: "repo-a",
        ticket: "team-1",
        branchName: "rocky-team-1",
        dir: "/home/sprite/groundcrew/worktrees/repo-a-team-1",
        kind: "remote",
        remoteProvider: "sprite",
        remoteRunnerName: "crew-claude-1",
        remoteRepoDir: "/home/sprite/dev/repo-a",
      },
    ]);

    expect(list(config)).toContainEqual({
      repository: "repo-a",
      ticket: "team-1",
      branchName: "rocky-team-1",
      dir: "/home/sprite/groundcrew/worktrees/repo-a-team-1",
      kind: "remote",
      remoteProvider: "sprite",
      remoteRunnerName: "crew-claude-1",
      remoteRepoDir: "/home/sprite/dev/repo-a",
    });
  });

  it("ignores malformed locally tracked remote entries", () => {
    const config = makeConfig({ projectDir });
    mkdirSync(join(projectDir, "state", "groundcrew"), { recursive: true });
    const validEntry: WorktreeEntry = {
      repository: "repo-a",
      ticket: "team-1",
      branchName: "rocky-team-1",
      dir: "/home/sprite/groundcrew/worktrees/repo-a-team-1",
      kind: "remote",
      remoteProvider: "sprite",
      remoteRunnerName: "crew-claude-1",
      remoteRepoDir: "/home/sprite/dev/repo-a",
    };
    writeFileSync(
      remoteStatePath(),
      `${JSON.stringify({ entries: [null, "bad", { kind: "remote" }, validEntry] })}\n`,
    );

    expect(list(config)).toStrictEqual([validEntry]);
  });

  it("ignores remote state files whose entries field is not an array", () => {
    const config = makeConfig({ projectDir });
    mkdirSync(join(projectDir, "state", "groundcrew"), { recursive: true });
    writeFileSync(remoteStatePath(), `${JSON.stringify({ entries: null })}\n`);

    expect(list(config)).toStrictEqual([]);
  });
});

describe(findByTicket, () => {
  setupTempProjectDir();

  it("returns every entry matching the ticket regardless of repo or kind", () => {
    mkdirSync(join(projectDir, "repo-a-team-1"));
    mkdirSync(join(projectDir, "repo-b-team-1"));
    const config = makeConfig({ projectDir, knownRepositories: ["repo-a", "repo-b"] });
    writeRemoteState([
      {
        repository: "repo-a",
        ticket: "team-1",
        branchName: "rocky-team-1",
        dir: "/home/sprite/groundcrew/worktrees/repo-a-team-1",
        kind: "remote",
        remoteProvider: "sprite",
        remoteRunnerName: "crew-claude-1",
        remoteRepoDir: "/home/sprite/dev/repo-a",
      },
    ]);

    const actual = findByTicket(config, "team-1");

    expect(actual).toHaveLength(3);
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

  it("returns undefined when no branch matches", () => {
    const config = makeConfig({ projectDir });

    expect(findByBranch(config, "repo-a", "rocky-team-999")).toBeUndefined();
  });
});

describe(create, () => {
  setupTempProjectDir();

  it("fetches origin/main then runs git worktree add for the host strategy", async () => {
    mkdirSync(join(projectDir, "repo-a"));
    const config = makeConfig({ projectDir });

    const actual = await create(config, {
      repository: "repo-a",
      ticket: "team-1",
      model: "claude",
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

  it("creates a remote worktree using the host-computed branch name", async () => {
    mkdirSync(join(projectDir, "repo-a"));
    const config = makeConfig({ projectDir });

    const actual = await create(config, {
      repository: "repo-a",
      ticket: "team-1",
      model: "claude",
      runner: "remote",
    });

    expect(runCommandMock).toHaveBeenCalledWith(
      "sprite",
      expect.arrayContaining(["exec", "-s", "crew-claude-1", "--", "bash", "-lc"]),
      { stdio: "inherit", timeoutMs: 0 },
    );
    const spriteCommand = runCommandMock.mock.calls.find(([cmd]) => cmd === "sprite")?.[1].at(-1);
    expect(spriteCommand).toStrictEqual(expect.stringContaining("branch='rocky-team-1'"));
    expect(spriteCommand).toStrictEqual(
      expect.stringContaining("repo_dir='/home/sprite/dev/ClipboardHealth--repo-a'"),
    );
    expect(spriteCommand).toStrictEqual(
      expect.stringContaining(
        "worktree_dir='/home/sprite/groundcrew/worktrees/ClipboardHealth--repo-a-team-1'",
      ),
    );
    expect(actual).toStrictEqual({
      repository: "repo-a",
      ticket: "team-1",
      branchName: "rocky-team-1",
      dir: "/home/sprite/groundcrew/worktrees/ClipboardHealth--repo-a-team-1",
      kind: "remote",
      remoteProvider: "sprite",
      remoteRunnerName: "crew-claude-1",
      remoteRepoDir: "/home/sprite/dev/ClipboardHealth--repo-a",
    });
    expect(readRemoteStateEntries()).toStrictEqual([actual]);
  });

  it("creates remote worktrees for owner-qualified repositories without double-prefixing the owner", async () => {
    mkdirSync(join(projectDir, "ClipboardHealth", "repo-a"), { recursive: true });
    const config = makeConfig({ projectDir, knownRepositories: ["ClipboardHealth/repo-a"] });

    const actual = await create(config, {
      repository: "ClipboardHealth/repo-a",
      ticket: "team-1",
      model: "claude",
      runner: "remote",
    });

    const spriteCommand = runCommandMock.mock.calls.find(([cmd]) => cmd === "sprite")?.[1].at(-1);
    expect(spriteCommand).toStrictEqual(
      expect.stringContaining("gh repo clone 'ClipboardHealth/repo-a'"),
    );
    expect(spriteCommand).toStrictEqual(
      expect.stringContaining("repo_dir='/home/sprite/dev/ClipboardHealth--repo-a'"),
    );
    expect(spriteCommand).toStrictEqual(
      expect.stringContaining(
        "worktree_dir='/home/sprite/groundcrew/worktrees/ClipboardHealth--repo-a-team-1'",
      ),
    );
    expect(actual).toMatchObject({
      repository: "ClipboardHealth/repo-a",
      dir: "/home/sprite/groundcrew/worktrees/ClipboardHealth--repo-a-team-1",
      remoteRepoDir: "/home/sprite/dev/ClipboardHealth--repo-a",
    });
  });

  it("rejects unknown workspace runners instead of falling back to host worktrees", async () => {
    mkdirSync(join(projectDir, "repo-a"));
    const config = makeConfig({ projectDir });

    await expect(
      create(config, {
        repository: "repo-a",
        ticket: "team-1",
        model: "claude",
        runner: "docker",
      } as unknown as Parameters<typeof create>[1]),
    ).rejects.toThrow(/Unknown workspace runner: "docker"/);
  });

  it("strips .git suffixes from remote directory names", async () => {
    mkdirSync(join(projectDir, "repo-a.git"));
    const config = makeConfig({ projectDir, knownRepositories: ["repo-a.git"] });

    const actual = await create(config, {
      repository: "repo-a.git",
      ticket: "team-1",
      model: "claude",
      runner: "remote",
    });

    expect(actual.remoteRepoDir).toBe("/home/sprite/dev/ClipboardHealth--repo-a");
    expect(actual.dir).toBe("/home/sprite/groundcrew/worktrees/ClipboardHealth--repo-a-team-1");
  });

  it("normalizes trailing slashes in configured remote roots", async () => {
    mkdirSync(join(projectDir, "repo-a"));
    const config = makeConfig({ projectDir });
    config.remote.repoRoot = "/home/sprite/dev///";
    config.remote.worktreeRoot = "/home/sprite/groundcrew/worktrees///";

    const actual = await create(config, {
      repository: "repo-a",
      ticket: "team-1",
      model: "claude",
      runner: "remote",
    });

    expect(actual.remoteRepoDir).toBe("/home/sprite/dev/ClipboardHealth--repo-a");
    expect(actual.dir).toBe("/home/sprite/groundcrew/worktrees/ClipboardHealth--repo-a-team-1");
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
      }),
    ).rejects.toThrow(/already exists/);
  });

  it("rejects when a remote worktree is already tracked for the same ticket", async () => {
    mkdirSync(join(projectDir, "repo-a"));
    const config = makeConfig({ projectDir });
    writeRemoteState([
      {
        repository: "repo-a",
        ticket: "team-1",
        branchName: "rocky-team-1",
        dir: "/home/sprite/groundcrew/worktrees/repo-a-team-1",
        kind: "remote",
        remoteProvider: "sprite",
        remoteRunnerName: "crew-claude-1",
        remoteRepoDir: "/home/sprite/dev/repo-a",
      },
    ]);

    await expect(
      create(config, {
        repository: "repo-a",
        ticket: "team-1",
        model: "claude",
        runner: "remote",
      }),
    ).rejects.toThrow(/already exists/);
  });

  it("rejects unknown repositories", async () => {
    const config = makeConfig({ projectDir });

    await expect(
      create(config, {
        repository: "ghost",
        ticket: "team-1",
        model: "claude",
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

  it("rejects malformed remote entries without runnerName", async () => {
    const config = makeConfig({ projectDir });

    await expect(
      remove(config, {
        repository: "repo-a",
        ticket: "team-1",
        branchName: "rocky-team-1",
        dir: "/home/sprite/groundcrew/worktrees/repo-a-team-1",
        kind: "remote",
        remoteRepoDir: "/home/sprite/dev/repo-a",
      }),
    ).rejects.toThrow(/missing remoteRunnerName/);
  });

  it("rejects unknown worktree kinds instead of falling back to host removal", async () => {
    const config = makeConfig({ projectDir });

    await expect(
      remove(config, {
        repository: "repo-a",
        ticket: "team-1",
        branchName: "rocky-team-1",
        dir: "/work/repo-a-team-1",
        kind: "sandbox",
      } as unknown as WorktreeEntry),
    ).rejects.toThrow(/Unknown worktree kind: "sandbox"/);
  });

  it("rejects malformed remote entries without remoteRepoDir", async () => {
    const config = makeConfig({ projectDir });

    await expect(
      remove(config, {
        repository: "repo-a",
        ticket: "team-1",
        branchName: "rocky-team-1",
        dir: "/home/sprite/groundcrew/worktrees/repo-a-team-1",
        kind: "remote",
        remoteProvider: "sprite",
        remoteRunnerName: "crew-claude-1",
      }),
    ).rejects.toThrow(/missing remoteRepoDir/);
  });
});

function spriteEntry(ticket: string): WorktreeEntry {
  return {
    repository: "repo-a",
    ticket,
    branchName: `rocky-${ticket}`,
    dir: `/home/sprite/groundcrew/worktrees/repo-a-${ticket}`,
    kind: "remote",
    remoteProvider: "sprite",
    remoteRunnerName: "crew-claude-1",
    remoteRepoDir: "/home/sprite/dev/repo-a",
  };
}

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

  it("removes a remote worktree remotely and deletes the local state entry after success", async () => {
    const config = makeConfig({ projectDir });
    const entry: WorktreeEntry = {
      repository: "repo-a",
      ticket: "team-1",
      branchName: "rocky-team-1",
      dir: "/home/sprite/groundcrew/worktrees/repo-a-team-1",
      kind: "remote",
      remoteProvider: "sprite",
      remoteRunnerName: "crew-claude-1",
      remoteRepoDir: "/home/sprite/dev/repo-a",
    };
    writeRemoteState([entry]);

    await remove(config, entry, { force: true });

    expect(runCommandMock).toHaveBeenCalledWith(
      "sprite",
      expect.arrayContaining(["exec", "-s", "crew-claude-1", "--", "bash", "-lc"]),
      { stdio: "inherit", timeoutMs: 0 },
    );
    const command = runCommandMock.mock.calls.find(([cmd]) => cmd === "sprite")?.[1].at(-1);
    expect(command).toStrictEqual(
      expect.stringContaining(
        "git -C '/home/sprite/dev/repo-a' worktree remove --force '/home/sprite/groundcrew/worktrees/repo-a-team-1'",
      ),
    );
    expect(command).toStrictEqual(
      expect.stringContaining("git -C '/home/sprite/dev/repo-a' branch -D 'rocky-team-1' || true"),
    );
    expect(readRemoteStateEntries()).toStrictEqual([]);
  });

  it("keeps the remote state entry when remote removal fails", async () => {
    const config = makeConfig({ projectDir });
    const entry: WorktreeEntry = {
      repository: "repo-a",
      ticket: "team-1",
      branchName: "rocky-team-1",
      dir: "/home/sprite/groundcrew/worktrees/repo-a-team-1",
      kind: "remote",
      remoteProvider: "sprite",
      remoteRunnerName: "crew-claude-1",
      remoteRepoDir: "/home/sprite/dev/repo-a",
    };
    writeRemoteState([entry]);
    runCommandMock.mockImplementation(() => {
      throw new Error("worktree busy");
    });

    await expect(remove(config, entry)).rejects.toThrow(/worktree busy/);

    expect(readRemoteStateEntries()).toStrictEqual([entry]);
  });

  it("dedupes the workspace close across host and remote entries for one ticket", async () => {
    workspacesProbeMock.mockResolvedValue({ kind: "ok", names: new Set(["team-1"]) });
    const config = makeConfig({ projectDir });
    const entries = [hostEntry("team-1"), spriteEntry("team-1")];

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

    expect(workspacesCloseMock).toHaveBeenCalledWith(config, "team-1", undefined);
    expect(result.workspaceProbe).toStrictEqual({ kind: "unavailable" });
    expect(result.closed).toStrictEqual(["team-1"]);
    expect(result.removed).toHaveLength(1);
  });

  // Regression: a flaky cmux/tmux throwing from probe must not abort the
  // batch; otherwise every on-disk worktree gets stranded.
  it("captures the error on workspaceProbe, best-effort closes, and still removes every worktree", async () => {
    workspacesProbeMock.mockResolvedValue({
      kind: "unavailable",
      error: new Error("cmux exploded"),
    });
    const config = makeConfig({ projectDir });
    const entries = [hostEntry("team-1"), hostEntry("team-2")];

    const result = await teardown(config, entries);

    expect(result.workspaceProbe.kind).toBe("unavailable");
    expect(probeError(result.workspaceProbe)).toBeInstanceOf(Error);
    expect(workspacesCloseMock).toHaveBeenCalledTimes(2);
    expect(workspacesCloseMock).toHaveBeenCalledWith(config, "team-1", undefined);
    expect(workspacesCloseMock).toHaveBeenCalledWith(config, "team-2", undefined);
    expect(result.closed).toStrictEqual(["team-1", "team-2"]);
    expect(result.removed).toHaveLength(2);
  });

  it("only best-effort closes a ticket once when duplicate entries exist and probe is unavailable", async () => {
    workspacesProbeMock.mockResolvedValue({ kind: "unavailable" });
    const config = makeConfig({ projectDir });
    const entries = [hostEntry("team-1"), spriteEntry("team-1")];

    const result = await teardown(config, entries);

    expect(workspacesCloseMock).toHaveBeenCalledTimes(1);
    expect(workspacesCloseMock).toHaveBeenCalledWith(config, "team-1", undefined);
    expect(result.closed).toStrictEqual(["team-1"]);
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
