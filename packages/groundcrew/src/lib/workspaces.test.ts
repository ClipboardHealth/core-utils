import { probeError } from "../testHelpers/workspaceProbe.ts";
import type { RunCommandOptions } from "./commandRunner.ts";
import type { ResolvedConfig, WorkspaceKindSetting } from "./config.ts";
import type * as hostModule from "./host.ts";
import { detectHostCapabilities, type HostCapabilities } from "./host.ts";
import type * as utilModule from "./util.ts";
import { resolveWorkspaceKind, workspaces } from "./workspaces.ts";

type RunCommandMock = (
  command: string,
  arguments_: readonly string[],
  options?: RunCommandOptions,
) => string;

const runMock = vi.hoisted(() => vi.fn<RunCommandMock>());

vi.mock(import("./commandRunner.ts"), async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    runCommand: runMock,
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- test mock intentionally shares one recorder across sync and async command APIs.
    runCommandAsync: runMock as unknown as typeof actual.runCommandAsync,
  };
});
vi.mock(import("./util.ts"), async (importOriginal) => {
  const actual = await importOriginal<typeof utilModule>();
  return {
    ...actual,
    log: vi.fn<typeof actual.log>(),
  };
});
vi.mock(import("./host.ts"), async (importOriginal) => {
  const actual = await importOriginal<typeof hostModule>();
  return {
    ...actual,
    detectHostCapabilities: vi.fn<typeof detectHostCapabilities>(),
  };
});

const detectHostMock = vi.mocked(detectHostCapabilities);

function makeHost(overrides: Partial<HostCapabilities> = {}): HostCapabilities {
  return {
    hasSafehouse: false,
    hasCmux: true,
    hasTmux: false,
    isMacOS: true,
    isSafehouseSupported: true,
    ...overrides,
  };
}

function makeConfig(workspaceKind: WorkspaceKindSetting = "auto"): ResolvedConfig {
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
      definitions: {
        claude: { cmd: "claude", color: "#fff" },
      },
    },
    prompts: { initial: "x" },
    workspaceKind,
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

function commonBeforeEach(): void {
  runMock.mockReturnValue("");
  detectHostMock.mockResolvedValue(makeHost());
}

function commonAfterEach(): void {
  vi.resetAllMocks();
}

describe("workspaces.open (cmux)", () => {
  beforeEach(commonBeforeEach);
  afterEach(commonAfterEach);

  it("calls cmux new-workspace with the spec's name, cwd, and command", async () => {
    runMock.mockReturnValue(JSON.stringify({ ref: "workspace:42" }));

    await workspaces.open(makeConfig(), {
      name: "TEAM-1",
      cwd: "/work/repo-a-TEAM-1",
      command: "exec claude",
    });

    expect(runMock).toHaveBeenCalledWith("cmux", [
      "--json",
      "new-workspace",
      "--name",
      "TEAM-1",
      "--cwd",
      "/work/repo-a-TEAM-1",
      "--command",
      "exec claude",
    ]);
  });

  it("calls cmux set-status with status text, color, icon when status is provided", async () => {
    runMock.mockReturnValue(JSON.stringify({ ref: "workspace:42" }));

    await workspaces.open(makeConfig(), {
      name: "TEAM-1",
      cwd: "/work/repo-a-TEAM-1",
      command: "exec claude",
      status: { text: "claude", color: "#C15F3C", icon: "sparkle" },
    });

    expect(runMock).toHaveBeenCalledWith("cmux", [
      "set-status",
      "model",
      "claude",
      "--icon",
      "sparkle",
      "--color",
      "#C15F3C",
      "--workspace",
      "workspace:42",
    ]);
  });

  it("does not call set-status when status is omitted", async () => {
    runMock.mockReturnValue(JSON.stringify({ ref: "workspace:42" }));

    await workspaces.open(makeConfig(), {
      name: "TEAM-1",
      cwd: "/work/repo-a-TEAM-1",
      command: "exec claude",
    });

    expect(runMock).not.toHaveBeenCalledWith("cmux", expect.arrayContaining(["set-status"]));
  });

  it("uses the JSON id field when ref is missing", async () => {
    runMock.mockReturnValue(JSON.stringify({ id: "abc123" }));

    await workspaces.open(makeConfig(), {
      name: "TEAM-1",
      cwd: "/cwd",
      command: "x",
      status: { text: "claude" },
    });

    expect(runMock).toHaveBeenCalledWith("cmux", expect.arrayContaining(["--workspace", "abc123"]));
  });

  it("falls back to extracting workspace:N from non-JSON cmux output", async () => {
    runMock.mockReturnValue("Created workspace:99 successfully");

    await workspaces.open(makeConfig(), {
      name: "TEAM-1",
      cwd: "/cwd",
      command: "x",
      status: { text: "claude" },
    });

    expect(runMock).toHaveBeenCalledWith(
      "cmux",
      expect.arrayContaining(["--workspace", "workspace:99"]),
    );
  });

  it("throws when cmux output yields no recognizable ref", async () => {
    runMock.mockReturnValue("garbage that has no ref");

    await expect(
      workspaces.open(makeConfig(), {
        name: "TEAM-1",
        cwd: "/cwd",
        command: "x",
      }),
    ).rejects.toThrow(/Unexpected cmux output/);
  });

  it("does not auto-close on unrecognized cmux output (avoids closing a same-named sibling)", async () => {
    runMock.mockReturnValueOnce("garbage that has no ref");

    await expect(
      workspaces.open(makeConfig(), { name: "TEAM-1", cwd: "/cwd", command: "x" }),
    ).rejects.toThrow(/Unexpected cmux output/);

    expect(runMock).not.toHaveBeenCalledWith("cmux", expect.arrayContaining(["close-workspace"]));
    expect(runMock).not.toHaveBeenCalledWith("cmux", expect.arrayContaining(["list-workspaces"]));
  });

  it("closes the just-created workspace when set-status fails", async () => {
    runMock
      .mockReturnValueOnce(JSON.stringify({ ref: "workspace:42" }))
      .mockImplementationOnce(() => {
        throw new Error("paint failed");
      })
      .mockReturnValue("");

    await expect(
      workspaces.open(makeConfig(), {
        name: "TEAM-1",
        cwd: "/cwd",
        command: "x",
        status: { text: "claude" },
      }),
    ).rejects.toThrow(/paint failed/);

    expect(runMock).toHaveBeenCalledWith("cmux", [
      "close-workspace",
      "--workspace",
      "workspace:42",
    ]);
  });

  it("passes AbortSignal to rollback close when set-status fails", async () => {
    const controller = new AbortController();
    runMock
      .mockReturnValueOnce(JSON.stringify({ ref: "workspace:42" }))
      .mockImplementationOnce(() => {
        throw new Error("paint failed");
      })
      .mockReturnValue("");

    await expect(
      workspaces.open(
        makeConfig(),
        {
          name: "TEAM-1",
          cwd: "/cwd",
          command: "x",
          status: { text: "claude" },
        },
        controller.signal,
      ),
    ).rejects.toThrow(/paint failed/);

    expect(runMock).toHaveBeenCalledWith(
      "cmux",
      ["close-workspace", "--workspace", "workspace:42"],
      { signal: controller.signal },
    );
  });

  it("caches the resolved adapter per config so detectHostCapabilities is not re-run", async () => {
    const config = makeConfig();
    runMock.mockReturnValue(JSON.stringify({ workspaces: [] }));

    await workspaces.probe(config);
    await workspaces.probe(config);
    await workspaces.probe(config);

    expect(detectHostMock).toHaveBeenCalledTimes(1);
  });
});

describe("workspaces.probe (cmux)", () => {
  beforeEach(commonBeforeEach);
  afterEach(commonAfterEach);

  it("returns kind=ok with the workspaces' titles as names", async () => {
    runMock.mockReturnValue(
      JSON.stringify({ workspaces: [{ title: "TEAM-1" }, { title: "TEAM-2" }] }),
    );

    await expect(workspaces.probe(makeConfig())).resolves.toStrictEqual({
      kind: "ok",
      names: new Set(["TEAM-1", "TEAM-2"]),
    });
    expect(runMock).toHaveBeenCalledWith("cmux", ["--json", "list-workspaces"]);
  });

  it("returns kind=ok with an empty name set when cmux reports no workspaces", async () => {
    runMock.mockReturnValue(JSON.stringify({ workspaces: [] }));
    await expect(workspaces.probe(makeConfig())).resolves.toStrictEqual({
      kind: "ok",
      names: new Set(),
    });
  });

  it("returns kind=unavailable when the cmux probe fails (adapter swallows; no error attached)", async () => {
    runMock.mockImplementation(() => {
      throw new Error("cmux down");
    });
    await expect(workspaces.probe(makeConfig())).resolves.toStrictEqual({ kind: "unavailable" });
  });

  it("rethrows cmux probe failures after the shutdown signal fires", async () => {
    const controller = new AbortController();
    controller.abort();
    runMock.mockImplementation(() => {
      throw new Error("cmux interrupted");
    });

    await expect(workspaces.probe(makeConfig(), controller.signal)).rejects.toThrow(
      "cmux interrupted",
    );
  });

  it("skips entries that lack a title", async () => {
    runMock.mockReturnValue(
      JSON.stringify({ workspaces: [{ title: "TEAM-1" }, { ref: "workspace:9" }] }),
    );
    await expect(workspaces.probe(makeConfig())).resolves.toStrictEqual({
      kind: "ok",
      names: new Set(["TEAM-1"]),
    });
  });
});

describe("workspaces.close (cmux)", () => {
  beforeEach(commonBeforeEach);
  afterEach(commonAfterEach);

  it("looks up the ref by name and calls close-workspace", async () => {
    runMock.mockReturnValue(
      JSON.stringify({ workspaces: [{ title: "TEAM-1", ref: "workspace:42" }] }),
    );

    await workspaces.close(makeConfig(), "TEAM-1");

    expect(runMock).toHaveBeenCalledWith("cmux", [
      "close-workspace",
      "--workspace",
      "workspace:42",
    ]);
  });

  it("falls back to the workspace id when ref is omitted", async () => {
    runMock.mockReturnValue(JSON.stringify({ workspaces: [{ title: "TEAM-1", id: "abc123" }] }));

    await workspaces.close(makeConfig(), "TEAM-1");

    expect(runMock).toHaveBeenCalledWith("cmux", ["close-workspace", "--workspace", "abc123"]);
  });

  it("is a no-op when no workspace exists for the name", async () => {
    runMock.mockReturnValue(JSON.stringify({ workspaces: [] }));

    await workspaces.close(makeConfig(), "TEAM-1");

    expect(runMock).not.toHaveBeenCalledWith("cmux", expect.arrayContaining(["close-workspace"]));
  });

  it("falls back to closing by workspace name when the cmux list itself fails", async () => {
    runMock
      .mockImplementationOnce(() => {
        throw new Error("cmux down");
      })
      .mockReturnValueOnce("");

    await expect(workspaces.close(makeConfig(), "TEAM-1")).resolves.toBeUndefined();
    expect(runMock).toHaveBeenCalledWith("cmux", ["close-workspace", "--workspace", "TEAM-1"]);
  });

  it("rethrows fallback close failures when the cmux list itself fails", async () => {
    runMock
      .mockImplementationOnce(() => {
        throw new Error("cmux down");
      })
      .mockImplementationOnce(() => {
        throw new Error("close down");
      });

    await expect(workspaces.close(makeConfig(), "TEAM-1")).rejects.toThrow("close down");
  });

  it("is a no-op when the workspace disappears between cmux list and close", async () => {
    runMock
      .mockReturnValueOnce(
        JSON.stringify({ workspaces: [{ title: "TEAM-1", ref: "workspace:42" }] }),
      )
      .mockImplementationOnce(() => {
        throw new Error("workspace not found");
      })
      .mockReturnValueOnce(JSON.stringify({ workspaces: [] }));

    await expect(workspaces.close(makeConfig(), "TEAM-1")).resolves.toBeUndefined();
  });

  it("rethrows cmux close failures when the workspace is still present", async () => {
    runMock
      .mockReturnValueOnce(
        JSON.stringify({ workspaces: [{ title: "TEAM-1", ref: "workspace:42" }] }),
      )
      .mockImplementationOnce(() => {
        throw new Error("permission denied");
      })
      .mockReturnValueOnce(
        JSON.stringify({ workspaces: [{ title: "TEAM-1", ref: "workspace:42" }] }),
      );

    await expect(workspaces.close(makeConfig(), "TEAM-1")).rejects.toThrow("permission denied");
  });

  it("rethrows cmux close failures when the follow-up list is unavailable", async () => {
    runMock
      .mockReturnValueOnce(
        JSON.stringify({ workspaces: [{ title: "TEAM-1", ref: "workspace:42" }] }),
      )
      .mockImplementationOnce(() => {
        throw new Error("permission denied");
      })
      .mockImplementationOnce(() => {
        throw new Error("cmux down");
      });

    await expect(workspaces.close(makeConfig(), "TEAM-1")).rejects.toThrow("permission denied");
  });

  it("rethrows cmux close failures after the shutdown signal fires", async () => {
    const controller = new AbortController();
    controller.abort();
    runMock
      .mockReturnValueOnce(
        JSON.stringify({ workspaces: [{ title: "TEAM-1", ref: "workspace:42" }] }),
      )
      .mockImplementationOnce(() => {
        throw new Error("close interrupted");
      });

    await expect(workspaces.close(makeConfig(), "TEAM-1", controller.signal)).rejects.toThrow(
      "close interrupted",
    );
    expect(runMock).toHaveBeenCalledTimes(2);
  });
});

describe("workspaces.open (tmux)", () => {
  beforeEach(() => {
    commonBeforeEach();
    detectHostMock.mockResolvedValue(makeHost({ hasCmux: false, hasTmux: true }));
  });
  afterEach(commonAfterEach);

  it("ensures the groundcrew session exists, then opens a window with atomic option chain", async () => {
    await workspaces.open(makeConfig("tmux"), {
      name: "TEAM-1",
      cwd: "/work/repo-a-TEAM-1",
      command: "exec claude",
    });

    expect(runMock).toHaveBeenCalledWith("tmux", ["has-session", "-t", "groundcrew"]);
    expect(runMock).toHaveBeenCalledWith("tmux", [
      "new-window",
      "-d",
      "-t",
      "groundcrew",
      "-n",
      "TEAM-1",
      "-c",
      "/work/repo-a-TEAM-1",
      "exec claude",
      ";",
      "set-window-option",
      "-t",
      "groundcrew:TEAM-1",
      "remain-on-exit",
      "off",
      ";",
      "set-window-option",
      "-t",
      "groundcrew:TEAM-1",
      "allow-rename",
      "off",
    ]);
  });

  it("creates the groundcrew session with a named idle window when has-session fails", async () => {
    runMock
      .mockImplementationOnce(() => {
        throw new Error("can't find session: groundcrew");
      })
      .mockReturnValue("");

    await workspaces.open(makeConfig("tmux"), { name: "TEAM-1", cwd: "/cwd", command: "x" });

    expect(runMock).toHaveBeenCalledWith("tmux", [
      "new-session",
      "-d",
      "-s",
      "groundcrew",
      "-n",
      "_groundcrew_idle",
    ]);
  });

  it("treats duplicate tmux session creation as success when a re-probe finds the session", async () => {
    runMock
      .mockImplementationOnce(() => {
        throw new Error("can't find session: groundcrew");
      })
      .mockImplementationOnce(() => {
        throw new Error("duplicate session: groundcrew");
      })
      .mockReturnValue("");

    await workspaces.open(makeConfig("tmux"), { name: "TEAM-1", cwd: "/cwd", command: "x" });

    expect(runMock).toHaveBeenNthCalledWith(3, "tmux", ["has-session", "-t", "groundcrew"]);
    expect(runMock).toHaveBeenCalledWith("tmux", expect.arrayContaining(["new-window"]));
  });

  it("rethrows tmux session creation failures when the re-probe still fails", async () => {
    runMock
      .mockImplementationOnce(() => {
        throw new Error("can't find session: groundcrew");
      })
      .mockImplementationOnce(() => {
        throw new Error("duplicate session: groundcrew");
      })
      .mockImplementationOnce(() => {
        throw new Error("can't find session: groundcrew");
      });

    await expect(
      workspaces.open(makeConfig("tmux"), { name: "TEAM-1", cwd: "/cwd", command: "x" }),
    ).rejects.toThrow("duplicate session: groundcrew");
    expect(runMock).toHaveBeenCalledTimes(3);
  });

  it("rethrows tmux session creation failures after the shutdown signal fires", async () => {
    const controller = new AbortController();
    runMock
      .mockImplementationOnce(() => {
        throw new Error("can't find session: groundcrew");
      })
      .mockImplementationOnce(() => {
        controller.abort();
        throw new Error("create interrupted");
      });

    await expect(
      workspaces.open(
        makeConfig("tmux"),
        { name: "TEAM-1", cwd: "/cwd", command: "x" },
        controller.signal,
      ),
    ).rejects.toThrow("create interrupted");
    expect(runMock).toHaveBeenCalledTimes(2);
  });

  it("rethrows tmux session probes after the shutdown signal fires", async () => {
    const controller = new AbortController();
    controller.abort();
    runMock.mockImplementation(() => {
      throw new Error("tmux interrupted");
    });

    await expect(
      workspaces.open(
        makeConfig("tmux"),
        { name: "TEAM-1", cwd: "/cwd", command: "x" },
        controller.signal,
      ),
    ).rejects.toThrow("tmux interrupted");
    expect(runMock).not.toHaveBeenCalledWith("tmux", expect.arrayContaining(["new-session"]));
  });

  it("silently drops the status field (tmux can't paint pills)", async () => {
    await workspaces.open(makeConfig("tmux"), {
      name: "TEAM-1",
      cwd: "/cwd",
      command: "x",
      status: { text: "claude", color: "#fff", icon: "sparkle" },
    });

    expect(runMock).not.toHaveBeenCalledWith("tmux", expect.arrayContaining(["set-status"]));
  });
});

describe("workspaces.probe (tmux)", () => {
  beforeEach(() => {
    commonBeforeEach();
    detectHostMock.mockResolvedValue(makeHost({ hasCmux: false, hasTmux: true }));
  });
  afterEach(commonAfterEach);

  it("returns kind=ok with live windows and filters out zombies (pane_dead != 0) and the idle sentinel", async () => {
    runMock.mockReturnValue("_groundcrew_idle\t0\nTEAM-1\t0\nTEAM-2\t1\nTEAM-3\t0\n");

    await expect(workspaces.probe(makeConfig("tmux"))).resolves.toStrictEqual({
      kind: "ok",
      names: new Set(["TEAM-1", "TEAM-3"]),
    });
    expect(runMock).toHaveBeenCalledWith("tmux", [
      "list-windows",
      "-t",
      "groundcrew",
      "-F",
      "#{window_name}\t#{pane_dead}",
    ]);
  });

  it("returns kind=ok with empty names when the groundcrew session does not exist", async () => {
    runMock.mockImplementation(() => {
      throw new Error("can't find session: groundcrew");
    });
    await expect(workspaces.probe(makeConfig("tmux"))).resolves.toStrictEqual({
      kind: "ok",
      names: new Set(),
    });
  });

  it("returns kind=ok with empty names when the tmux server is down", async () => {
    runMock.mockImplementation(() => {
      throw new Error("no server running on /tmp/tmux-501/default");
    });
    await expect(workspaces.probe(makeConfig("tmux"))).resolves.toStrictEqual({
      kind: "ok",
      names: new Set(),
    });
  });

  it("returns kind=unavailable when tmux fails for an unknown reason", async () => {
    runMock.mockImplementation(() => {
      throw new Error("permission denied or whatever");
    });
    await expect(workspaces.probe(makeConfig("tmux"))).resolves.toStrictEqual({
      kind: "unavailable",
    });
  });

  it("rethrows tmux list failures after the shutdown signal fires", async () => {
    const controller = new AbortController();
    controller.abort();
    runMock.mockImplementation(() => {
      throw new Error("tmux list interrupted");
    });

    await expect(workspaces.probe(makeConfig("tmux"), controller.signal)).rejects.toThrow(
      "tmux list interrupted",
    );
  });
});

describe("workspaces.probe (adapter resolution failure)", () => {
  beforeEach(commonBeforeEach);
  afterEach(commonAfterEach);

  // Auto resolution throws when neither cmux nor tmux is installed; the
  // probe wrapper must capture that as an `unavailable` verdict so callers
  // see the adapter failure as data rather than a thrown exception.
  it("captures a thrown adapter resolution error on the probe verdict", async () => {
    detectHostMock.mockResolvedValue(makeHost({ hasCmux: false, hasTmux: false }));

    const result = await workspaces.probe(makeConfig("auto"));

    expect(result.kind).toBe("unavailable");
    expect(probeError(result)).toBeInstanceOf(Error);
  });

  it("rethrows adapter resolution errors after the shutdown signal fires", async () => {
    const controller = new AbortController();
    controller.abort();
    detectHostMock.mockRejectedValue(new Error("host probe interrupted"));

    await expect(workspaces.probe(makeConfig("auto"), controller.signal)).rejects.toThrow(
      "host probe interrupted",
    );
  });
});

describe("workspaces.close (tmux)", () => {
  beforeEach(() => {
    commonBeforeEach();
    detectHostMock.mockResolvedValue(makeHost({ hasCmux: false, hasTmux: true }));
  });
  afterEach(commonAfterEach);

  it("calls kill-window directly without a pre-probe list", async () => {
    await workspaces.close(makeConfig("tmux"), "TEAM-1");

    expect(runMock).toHaveBeenCalledWith("tmux", ["kill-window", "-t", "groundcrew:TEAM-1"]);
    expect(runMock).not.toHaveBeenCalledWith("tmux", expect.arrayContaining(["list-windows"]));
  });

  it("is a no-op when tmux reports the window is missing", async () => {
    runMock.mockImplementation(() => {
      throw new Error("can't find window: TEAM-1");
    });

    await expect(workspaces.close(makeConfig("tmux"), "TEAM-1")).resolves.toBeUndefined();
  });

  it("is a no-op when the session does not exist", async () => {
    runMock.mockImplementation(() => {
      throw new Error("can't find session: groundcrew");
    });

    await expect(workspaces.close(makeConfig("tmux"), "TEAM-1")).resolves.toBeUndefined();
  });

  it("rethrows tmux close failures after the shutdown signal fires", async () => {
    const controller = new AbortController();
    controller.abort();
    runMock.mockImplementation(() => {
      throw new Error("close interrupted");
    });

    await expect(workspaces.close(makeConfig("tmux"), "TEAM-1", controller.signal)).rejects.toThrow(
      "close interrupted",
    );
  });

  it("propagates non-NotFound kill-window errors so callers see them (parity with cmux)", async () => {
    runMock.mockImplementation(() => {
      throw new Error("permission denied");
    });

    await expect(workspaces.close(makeConfig("tmux"), "TEAM-1")).rejects.toThrow(
      /permission denied/,
    );
  });
});

describe(resolveWorkspaceKind, () => {
  beforeEach(commonBeforeEach);
  afterEach(commonAfterEach);

  it("returns cmux when explicitly set and cmux is on PATH", () => {
    const result = resolveWorkspaceKind({
      config: makeConfig("cmux"),
      host: makeHost({ hasCmux: true }),
    });
    expect(result.resolved).toBe("cmux");
    expect(result.requested).toBe("cmux");
  });

  it("throws when cmux is set but the binary is missing", () => {
    expect(() => {
      resolveWorkspaceKind({
        config: makeConfig("cmux"),
        host: makeHost({ hasCmux: false }),
      });
    }).toThrow(/cmux binary is not on PATH/);
  });

  it("rejects explicit cmux on non-macOS hosts even when the binary is present", () => {
    expect(() => {
      resolveWorkspaceKind({
        config: makeConfig("cmux"),
        host: makeHost({ isMacOS: false, hasCmux: true }),
      });
    }).toThrow(/only supported on macOS/);
  });

  it("returns tmux when explicitly set and tmux is on PATH", () => {
    const result = resolveWorkspaceKind({
      config: makeConfig("tmux"),
      host: makeHost({ hasCmux: false, hasTmux: true }),
    });
    expect(result.resolved).toBe("tmux");
  });

  it("throws when tmux is set but the binary is missing", () => {
    expect(() => {
      resolveWorkspaceKind({
        config: makeConfig("tmux"),
        host: makeHost({ hasTmux: false }),
      });
    }).toThrow(/tmux binary is not on PATH/);
  });

  it("auto prefers cmux when present on macOS", () => {
    const result = resolveWorkspaceKind({
      config: makeConfig("auto"),
      host: makeHost({ isMacOS: true, hasCmux: true, hasTmux: true }),
    });
    expect(result.resolved).toBe("cmux");
    expect(result.reason).toMatch(/macOS with cmux/);
  });

  it("auto skips cmux on non-macOS even when the binary is on PATH", () => {
    const result = resolveWorkspaceKind({
      config: makeConfig("auto"),
      host: makeHost({ isMacOS: false, hasCmux: true, hasTmux: true }),
    });
    expect(result.resolved).toBe("tmux");
    expect(result.reason).toMatch(/non-macOS/);
  });

  it("auto falls back to tmux when cmux is missing", () => {
    const result = resolveWorkspaceKind({
      config: makeConfig("auto"),
      host: makeHost({ hasCmux: false, hasTmux: true }),
    });
    expect(result.resolved).toBe("tmux");
    expect(result.reason).toMatch(/falling back to tmux/);
  });

  it("auto throws when neither cmux nor tmux is on PATH", () => {
    expect(() => {
      resolveWorkspaceKind({
        config: makeConfig("auto"),
        host: makeHost({ hasCmux: false, hasTmux: false }),
      });
    }).toThrow(/neither cmux nor tmux is on PATH/);
  });
});
