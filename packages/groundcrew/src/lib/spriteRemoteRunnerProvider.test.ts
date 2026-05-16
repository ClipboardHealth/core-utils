import type { RunCommandOptions } from "./commandRunner.ts";
import type { RemoteRunnerConfig } from "./config.ts";
import {
  getRemoteRunnerProvider,
  remoteConfigWithRunnerName,
  spriteRemoteRunnerProvider,
} from "./spriteRemoteRunnerProvider.ts";

type RunCommandAsyncMock = (
  command: string,
  arguments_: readonly string[],
  options?: RunCommandOptions,
) => Promise<string | undefined>;

const runCommandMock = vi.hoisted(() => vi.fn<RunCommandAsyncMock>());

vi.mock(import("./commandRunner.ts"), async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- test mock records calls across runCommandAsync overloads.
    runCommandAsync: runCommandMock as unknown as typeof actual.runCommandAsync,
  };
});

function remoteConfig(overrides: Partial<RemoteRunnerConfig> = {}): RemoteRunnerConfig {
  return {
    ...remoteConfigWithRunnerName("crew-special"),
    owner: "Acme",
    repoRoot: "/srv/repos/",
    worktreeRoot: "/srv/worktrees/",
    secretNames: ["NPM_TOKEN"],
    ...overrides,
  };
}

describe("Sprite remote runner provider", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("detects existing runners by exact escaped runner name", async () => {
    const config = remoteConfig({ runnerName: "crew.special+1" });
    runCommandMock.mockResolvedValue(
      "NAME STATUS\ncrew.special+1 running\ncrew-special-2 running\n",
    );

    const actual = await spriteRemoteRunnerProvider.runnerExists(config);

    expect(actual).toBe(true);
    expect(runCommandMock).toHaveBeenCalledWith("sprite", ["list", "--sprite", "crew.special+1"]);
  });

  it("returns false when the configured runner is absent", async () => {
    const config = remoteConfig({ runnerName: "crew-special-1" });
    runCommandMock.mockResolvedValue("NAME STATUS\ncrew-special-2 running\n");

    const actual = await spriteRemoteRunnerProvider.runnerExists(config);

    expect(actual).toBe(false);
  });

  it("creates runners with inherited stdio and no timeout", async () => {
    const config = remoteConfig();
    runCommandMock.mockResolvedValue("");

    await spriteRemoteRunnerProvider.createRunner(config);

    expect(runCommandMock).toHaveBeenCalledWith(
      "sprite",
      ["create", "--skip-console", "crew-special"],
      { stdio: "inherit", timeoutMs: 0 },
    );
  });

  it("runs captured remote commands with files, working directory, and caller options", async () => {
    const config = remoteConfig();
    runCommandMock.mockResolvedValue("ok");

    const actual = await spriteRemoteRunnerProvider.runCommand({
      config,
      remoteArguments: ["bash", "-lc", "pwd"],
      files: [{ localPath: "/tmp/prompt.txt", remotePath: "/remote/prompt.txt" }],
      workingDirectory: "/srv/repos/core-utils",
      options: { timeoutMs: 30_000 },
    });

    expect(actual).toBe("ok");
    expect(runCommandMock).toHaveBeenCalledWith(
      "sprite",
      [
        "exec",
        "-s",
        "crew-special",
        "--file",
        "/tmp/prompt.txt:/remote/prompt.txt",
        "--dir",
        "/srv/repos/core-utils",
        "--",
        "bash",
        "-lc",
        "pwd",
      ],
      { timeoutMs: 30_000 },
    );
  });

  it("preserves explicit captured stdio options for remote commands", async () => {
    const config = remoteConfig();
    runCommandMock.mockResolvedValue("ok\n");

    await spriteRemoteRunnerProvider.runCommand({
      config,
      remoteArguments: ["printf", "ok"],
      options: { stdio: "captured", trim: false },
    });

    expect(runCommandMock).toHaveBeenCalledWith(
      "sprite",
      ["exec", "-s", "crew-special", "--", "printf", "ok"],
      { stdio: "captured", trim: false },
    );
  });

  it("runs TTY commands through sprite exec with inherited stdio", async () => {
    const config = remoteConfig();
    runCommandMock.mockResolvedValue("");

    await spriteRemoteRunnerProvider.runTtyCommand({
      config,
      remoteArguments: ["claude", "start"],
      files: [{ localPath: "/tmp/prompt.txt", remotePath: "/remote/prompt.txt" }],
      workingDirectory: "/srv/repos/core-utils",
      options: { timeoutMs: 15_000 },
    });

    expect(runCommandMock).toHaveBeenCalledWith(
      "sprite",
      [
        "exec",
        "--tty",
        "-s",
        "crew-special",
        "--file",
        "/tmp/prompt.txt:/remote/prompt.txt",
        "--dir",
        "/srv/repos/core-utils",
        "--",
        "claude",
        "start",
      ],
      { stdio: "inherit", timeoutMs: 15_000 },
    );
  });

  it("builds TTY commands without optional file uploads or working directory", () => {
    const config = remoteConfig();

    const actual = spriteRemoteRunnerProvider.buildTtyCommand({
      config,
      remoteArguments: ["pwd"],
    });

    expect(actual).toBe("sprite exec --tty -s 'crew-special' -- 'pwd'");
  });

  it("creates remote worktrees under provider-owned repository and worktree roots", async () => {
    const config = remoteConfig();
    const controller = new AbortController();
    runCommandMock.mockResolvedValue("");

    const actual = await spriteRemoteRunnerProvider.createWorktree({
      config,
      repository: "tools.git",
      ticket: "GC-12",
      branchName: "feature/remote-runner",
      baseBranch: "main",
      signal: controller.signal,
    });

    expect(actual).toStrictEqual({
      remoteRepoDir: "/srv/repos/tools",
      remoteWorktreeDir: "/srv/worktrees/tools-GC-12",
    });
    expect(runCommandMock).toHaveBeenCalledWith(
      "sprite",
      [
        "exec",
        "-s",
        "crew-special",
        "--",
        "bash",
        "-lc",
        expect.stringContaining("gh repo clone 'Acme/tools.git'"),
      ],
      { signal: controller.signal, stdio: "inherit", timeoutMs: 0 },
    );
    const script = runCommandMock.mock.calls[0]?.[1].at(-1);
    expect(script).toContain("repo_dir='/srv/repos/tools'");
    expect(script).toContain("worktree_dir='/srv/worktrees/tools-GC-12'");
    expect(script).toContain('git -C "$repo_dir" worktree add -b "$branch"');
  });

  it("removes remote worktrees through the entry runner and repository", async () => {
    const config = remoteConfig();
    runCommandMock.mockResolvedValue("");

    await spriteRemoteRunnerProvider.removeWorktree({
      config,
      entry: {
        branchName: "feature/remote-runner",
        dir: "/srv/worktrees/tools-GC-12",
        remoteRepoDir: "/srv/repos/tools",
        remoteRunnerName: "crew-special",
      },
      force: true,
    });

    expect(runCommandMock).toHaveBeenCalledWith(
      "sprite",
      [
        "exec",
        "-s",
        "crew-special",
        "--",
        "bash",
        "-lc",
        expect.stringContaining("git -C '/srv/repos/tools' worktree remove --force"),
      ],
      { stdio: "inherit", timeoutMs: 0 },
    );
  });

  it("rejects incomplete remote worktree entries before shelling out", async () => {
    const config = remoteConfig();

    await expect(
      spriteRemoteRunnerProvider.removeWorktree({
        config,
        entry: {
          branchName: "feature/remote-runner",
          dir: "/srv/worktrees/tools-GC-12",
          remoteRepoDir: "/srv/repos/tools",
        },
        force: false,
      }),
    ).rejects.toThrow(/missing remoteRunnerName/);
    await expect(
      spriteRemoteRunnerProvider.removeWorktree({
        config,
        entry: {
          branchName: "feature/remote-runner",
          dir: "/srv/worktrees/tools-GC-12",
          remoteRunnerName: "crew-special",
        },
        force: false,
      }),
    ).rejects.toThrow(/missing remoteRepoDir/);
    expect(runCommandMock).not.toHaveBeenCalled();
  });
});

describe(getRemoteRunnerProvider, () => {
  it("returns the Sprite provider for the configured provider name", () => {
    expect(getRemoteRunnerProvider("sprite")).toBe(spriteRemoteRunnerProvider);
  });

  it("rejects unknown provider names at runtime", () => {
    expect(() => {
      Reflect.apply(getRemoteRunnerProvider, undefined, ["other"]);
    }).toThrow(/Unknown remote provider/);
  });
});
