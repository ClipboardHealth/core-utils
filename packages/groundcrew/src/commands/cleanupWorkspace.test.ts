import { loadConfig, type ResolvedConfig } from "../lib/config.ts";
import { type WorktreeEntry, worktrees } from "../lib/worktrees.ts";
import { captureConsoleLog, type ConsoleCapture } from "../testHelpers/consoleCapture.ts";
import { emptyTeardownResult } from "../testHelpers/teardownResult.ts";
import { cleanupWorkspace, cleanupWorkspaceCli } from "./cleanupWorkspace.ts";

vi.mock(import("../lib/config.ts"), async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, loadConfig: vi.fn<typeof loadConfig>() };
});
vi.mock(import("../lib/worktrees.ts"), async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    worktrees: {
      ...actual.worktrees,
      findByTicket: vi.fn<typeof actual.worktrees.findByTicket>(),
      teardown: vi.fn<typeof actual.worktrees.teardown>(),
    },
  };
});

const loadConfigMock = vi.mocked(loadConfig);
const findByTicketMock = vi.mocked(worktrees.findByTicket);
const teardownMock = vi.mocked(worktrees.teardown);

const hostEntry: WorktreeEntry = {
  repository: "repo-a",
  ticket: "team-1",
  branchName: "rocky-team-1",
  dir: "/work/repo-a-team-1",
  kind: "host",
};

const sandboxEntry: WorktreeEntry = {
  repository: "repo-a",
  ticket: "team-1",
  branchName: "rocky-team-1",
  dir: "/work/repo-a/.sbx/groundcrew-repo-a-claude-worktrees/rocky-team-1",
  kind: "sandbox",
  sandboxName: "groundcrew-repo-a-claude",
};

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
    definitions: { claude: { cmd: "claude", color: "#fff" } },
  },
  prompts: { initial: "x" },
  workspaceKind: "auto",
  logging: { file: "/tmp/groundcrew-test.log" },
};

describe(cleanupWorkspace, () => {
  let consoleLog: ConsoleCapture;

  beforeEach(() => {
    consoleLog = captureConsoleLog();
    teardownMock.mockResolvedValue(emptyTeardownResult());
  });

  afterEach(() => {
    consoleLog.restore();
    vi.resetAllMocks();
  });

  it("hands the host worktree to teardown", async () => {
    findByTicketMock.mockReturnValue([hostEntry]);
    teardownMock.mockResolvedValue(emptyTeardownResult({ removed: [hostEntry] }));

    await cleanupWorkspace(config, { ticket: "team-1" });

    expect(teardownMock).toHaveBeenCalledWith(config, [hostEntry], { force: false });
  });

  it("passes --force through to teardown", async () => {
    findByTicketMock.mockReturnValue([hostEntry]);
    teardownMock.mockResolvedValue(emptyTeardownResult({ removed: [hostEntry] }));

    await cleanupWorkspace(config, { ticket: "team-1", force: true });

    expect(teardownMock).toHaveBeenCalledWith(config, [hostEntry], { force: true });
  });

  it("logs and returns without calling teardown when no worktree is found", async () => {
    findByTicketMock.mockReturnValue([]);

    await cleanupWorkspace(config, { ticket: "team-1" });

    expect(teardownMock).not.toHaveBeenCalled();
    expect(consoleLog.output()).toContain("nothing to clean up");
  });

  it("hands a sandbox-kind entry to teardown", async () => {
    findByTicketMock.mockReturnValue([sandboxEntry]);
    teardownMock.mockResolvedValue(emptyTeardownResult({ removed: [sandboxEntry] }));

    await cleanupWorkspace(config, { ticket: "team-1" });

    expect(teardownMock).toHaveBeenCalledWith(config, [sandboxEntry], { force: false });
  });

  it("hands BOTH a host and sandbox worktree to teardown for the same ticket", async () => {
    findByTicketMock.mockReturnValue([hostEntry, sandboxEntry]);
    teardownMock.mockResolvedValue(emptyTeardownResult({ removed: [hostEntry, sandboxEntry] }));

    await cleanupWorkspace(config, { ticket: "team-1" });

    expect(teardownMock).toHaveBeenCalledWith(config, [hostEntry, sandboxEntry], { force: false });
  });

  it("logs `workspace list failed: ...` when teardown reports a probe-throw error", async () => {
    findByTicketMock.mockReturnValue([hostEntry]);
    teardownMock.mockResolvedValue(
      emptyTeardownResult({
        workspaceProbe: { kind: "unavailable", error: new Error("cmux exploded") },
        removed: [hostEntry],
      }),
    );

    await cleanupWorkspace(config, { ticket: "team-1" });

    expect(consoleLog.output()).toContain("workspace list failed: cmux exploded");
  });

  it("stays silent on workspaceProbe.unavailable when no underlying error is reported", async () => {
    findByTicketMock.mockReturnValue([hostEntry]);
    teardownMock.mockResolvedValue(
      emptyTeardownResult({
        workspaceProbe: { kind: "unavailable" },
        removed: [hostEntry],
      }),
    );

    await cleanupWorkspace(config, { ticket: "team-1" });

    expect(consoleLog.output()).not.toContain("workspace list failed");
  });

  it("logs Closed workspace lines for each ticket teardown reports closed", async () => {
    findByTicketMock.mockReturnValue([hostEntry]);
    teardownMock.mockResolvedValue(
      emptyTeardownResult({ closed: ["team-1"], removed: [hostEntry] }),
    );

    await cleanupWorkspace(config, { ticket: "team-1" });

    expect(consoleLog.output()).toContain("Closed workspace team-1");
  });

  it("logs Cleanup complete with each removed worktree's dir and kind", async () => {
    findByTicketMock.mockReturnValue([hostEntry]);
    teardownMock.mockResolvedValue(emptyTeardownResult({ removed: [hostEntry] }));

    await cleanupWorkspace(config, { ticket: "team-1" });

    expect(consoleLog.output()).toContain("Cleanup complete for team-1 (host)");
    expect(consoleLog.output()).toContain("/work/repo-a-team-1 (removed)");
  });

  it("re-throws the first failure reported by teardown", async () => {
    findByTicketMock.mockReturnValue([hostEntry]);
    teardownMock.mockResolvedValue(
      emptyTeardownResult({
        failures: [
          { entry: hostEntry, step: "worktree_remove", error: new Error("worktree busy") },
        ],
      }),
    );

    await expect(cleanupWorkspace(config, { ticket: "team-1" })).rejects.toThrow(/worktree busy/);
  });

  it("logs workspace close failures from teardown", async () => {
    findByTicketMock.mockReturnValue([hostEntry]);
    teardownMock.mockResolvedValue(
      emptyTeardownResult({
        failures: [{ entry: hostEntry, step: "workspace_close", error: new Error("cmux down") }],
      }),
    );

    await expect(cleanupWorkspace(config, { ticket: "team-1" })).rejects.toThrow(/cmux down/);
    expect(consoleLog.output()).toContain("workspace close failed for team-1: cmux down");
  });

  it("logs Cleanup failed for a worktree_remove failure", async () => {
    findByTicketMock.mockReturnValue([hostEntry]);
    teardownMock.mockResolvedValue(
      emptyTeardownResult({
        failures: [{ entry: hostEntry, step: "worktree_remove", error: new Error("busy") }],
      }),
    );

    await expect(cleanupWorkspace(config, { ticket: "team-1" })).rejects.toThrow(/busy/);
    expect(consoleLog.output()).toContain("Cleanup failed for team-1 (host): busy");
  });
});

describe(cleanupWorkspaceCli, () => {
  let consoleLog: ConsoleCapture;

  beforeEach(() => {
    consoleLog = captureConsoleLog();
    findByTicketMock.mockReturnValue([hostEntry]);
    loadConfigMock.mockResolvedValue(config);
    teardownMock.mockResolvedValue(emptyTeardownResult({ removed: [hostEntry] }));
  });

  afterEach(() => {
    consoleLog.restore();
    vi.resetAllMocks();
  });

  it("parses the ticket from argv", async () => {
    await cleanupWorkspaceCli(["team-1"]);

    expect(findByTicketMock).toHaveBeenCalledWith(config, "team-1");
  });

  it("lowercases an uppercase ticket arg before lookup", async () => {
    await cleanupWorkspaceCli(["TEAM-1"]);

    expect(findByTicketMock).toHaveBeenCalledWith(config, "team-1");
  });

  it("recognizes --force anywhere in argv", async () => {
    await cleanupWorkspaceCli(["--force", "team-1"]);

    expect(teardownMock).toHaveBeenCalledWith(config, [hostEntry], { force: true });
  });

  it("throws a usage error when no ticket is provided", async () => {
    await expect(cleanupWorkspaceCli([])).rejects.toThrow(/Usage: crew cleanup/);
  });

  it("rejects unknown options instead of treating them as the ticket", async () => {
    await expect(cleanupWorkspaceCli(["--bogus", "team-1"])).rejects.toThrow(
      /Unknown option: --bogus/,
    );
    expect(findByTicketMock).not.toHaveBeenCalled();
  });

  it("rejects extra positional args", async () => {
    await expect(cleanupWorkspaceCli(["team-1", "extra"])).rejects.toThrow(/Usage: crew cleanup/);
    expect(findByTicketMock).not.toHaveBeenCalled();
  });
});
