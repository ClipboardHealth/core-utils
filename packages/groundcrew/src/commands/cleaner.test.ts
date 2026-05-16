import type { BoardState, Issue } from "../lib/boardSource.ts";
import type { ResolvedConfig } from "../lib/config.ts";
import { type WorktreeEntry, worktrees } from "../lib/worktrees.ts";
import { captureConsoleLog, type ConsoleCapture } from "../testHelpers/consoleCapture.ts";
import { emptyTeardownResult } from "../testHelpers/teardownResult.ts";
import { createCleaner } from "./cleaner.ts";

vi.mock(import("../lib/worktrees.ts"), async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    worktrees: {
      ...actual.worktrees,
      teardown: vi.fn<typeof actual.worktrees.teardown>(),
    },
  };
});

const teardownMock = vi.mocked(worktrees.teardown);

function makeConfig(overrides: Partial<ResolvedConfig> = {}): ResolvedConfig {
  return {
    linear: {
      projectSlug: "ai-strategy-aaaaaaaaaaaa",
      slugId: "aaaaaaaaaaaa",
      statuses: { todo: "Todo", inProgress: "In Progress", done: "Done", terminal: ["Done"] },
      ...overrides.linear,
    },
    git: { remote: "origin", defaultBranch: "main", ...overrides.git },
    workspace: {
      projectDir: "/work",
      knownRepositories: ["repo-a"],
      ...overrides.workspace,
    },
    orchestrator: {
      maximumInProgress: 2,
      pollIntervalMilliseconds: 1000,
      sessionLimitPercentage: 85,
      ...overrides.orchestrator,
    },
    models: {
      default: "claude",
      definitions: { claude: { cmd: "claude", color: "#fff" } },
      ...overrides.models,
    },
    prompts: { initial: "x", ...overrides.prompts },
    workspaceKind: overrides.workspaceKind ?? "auto",
    remote: {
      provider: "sprite",
      runnerName: "crew-claude-1",
      owner: "ClipboardHealth",
      repoRoot: "/home/sprite/dev",
      worktreeRoot: "/home/sprite/groundcrew/worktrees",
      secretNames: ["NPM_TOKEN", "BUF_TOKEN"],
      ...overrides.remote,
    },
    logging: { file: "/tmp/groundcrew-test.log", ...overrides.logging },
  };
}

function doneIssue(id: string, overrides: Partial<Issue> = {}): Issue {
  return {
    id,
    uuid: `uuid-${id}`,
    title: "Title",
    status: "Done",
    statusId: "state-done",
    assignee: "Alice",
    updatedAt: "2025-01-01T00:00:00.000Z",
    repository: "repo-a",
    model: "claude",
    runner: "local",
    teamId: "team-1",
    blockers: [],
    hasMoreBlockers: false,
    ...overrides,
  };
}

function todoIssue(id: string, overrides: Partial<Issue> = {}): Issue {
  return doneIssue(id, { status: "Todo", statusId: "state-todo", ...overrides });
}

function boardOf(issues: Issue[]): BoardState {
  return { timestamp: "2025-01-01T00:00:00.000Z", issues };
}

function hostEntryFor(repository: string, ticket: string): WorktreeEntry {
  return {
    repository,
    ticket,
    branchName: `rocky-${ticket.toLowerCase()}`,
    dir: `/work/${repository}-${ticket}`,
    kind: "host",
  };
}

function spriteEntryFor(repository: string, ticket: string): WorktreeEntry {
  return {
    repository,
    ticket,
    branchName: `rocky-${ticket.toLowerCase()}`,
    dir: `/home/sprite/groundcrew/worktrees/${repository}-${ticket}`,
    kind: "remote",
    remoteProvider: "sprite",
    remoteRunnerName: "crew-claude-1",
    remoteRepoDir: `/home/sprite/dev/${repository}`,
  };
}

describe(createCleaner, () => {
  let consoleLog: ConsoleCapture;

  beforeEach(() => {
    consoleLog = captureConsoleLog();
    teardownMock.mockResolvedValue(emptyTeardownResult());
  });

  afterEach(() => {
    consoleLog.restore();
    vi.clearAllMocks();
  });

  it("calls teardown for a Done ticket's worktree", async () => {
    const cleaner = createCleaner({ config: makeConfig() });
    const entry = hostEntryFor("repo-a", "team-1");
    teardownMock.mockResolvedValue(emptyTeardownResult({ removed: [entry] }));

    await cleaner.runOnce({
      state: boardOf([doneIssue("team-1")]),
      worktreeEntries: [entry],
      dryRun: false,
    });

    expect(teardownMock).toHaveBeenCalledWith(expect.anything(), [entry]);
    expect(consoleLog.output()).toContain("event=cleanup outcome=cleaned ticket=team-1");
  });

  it("ignores worktrees whose ticket is not in the project", async () => {
    const cleaner = createCleaner({ config: makeConfig() });

    await cleaner.runOnce({
      state: boardOf([doneIssue("team-1")]),
      worktreeEntries: [hostEntryFor("repo-a", "other-1")],
      dryRun: false,
    });

    expect(teardownMock).not.toHaveBeenCalled();
  });

  it("does not act when there are no terminal tickets", async () => {
    const cleaner = createCleaner({ config: makeConfig() });

    await cleaner.runOnce({
      state: boardOf([todoIssue("team-1")]),
      worktreeEntries: [hostEntryFor("repo-a", "team-1")],
      dryRun: false,
    });

    expect(teardownMock).not.toHaveBeenCalled();
  });

  it("respects custom terminal statuses", async () => {
    const cleaner = createCleaner({
      config: makeConfig({
        linear: {
          projectSlug: "x-aaaaaaaaaaaa",
          slugId: "aaaaaaaaaaaa",
          statuses: {
            todo: "Todo",
            inProgress: "In Progress",
            done: "Done",
            terminal: ["Done", "Released"],
          },
        },
      }),
    });
    const entry = hostEntryFor("repo-a", "team-1");

    await cleaner.runOnce({
      state: boardOf([doneIssue("team-1", { status: "Released", statusId: "state-released" })]),
      worktreeEntries: [entry],
      dryRun: false,
    });

    expect(teardownMock).toHaveBeenCalledWith(expect.anything(), [entry]);
  });

  it("logs workspace_closed events for tickets reported by teardown", async () => {
    const cleaner = createCleaner({ config: makeConfig() });
    teardownMock.mockResolvedValue(emptyTeardownResult({ closed: ["team-1"] }));

    await cleaner.runOnce({
      state: boardOf([doneIssue("team-1")]),
      worktreeEntries: [hostEntryFor("repo-a", "team-1")],
      dryRun: false,
    });

    expect(consoleLog.output()).toContain("event=cleanup outcome=workspace_closed ticket=team-1");
  });

  it("logs workspace_list_failed when teardown reports the adapter unavailable", async () => {
    const cleaner = createCleaner({ config: makeConfig() });
    teardownMock.mockResolvedValue(
      emptyTeardownResult({ workspaceProbe: { kind: "unavailable" } }),
    );

    await cleaner.runOnce({
      state: boardOf([doneIssue("team-1")]),
      worktreeEntries: [hostEntryFor("repo-a", "team-1")],
      dryRun: false,
    });

    expect(consoleLog.output()).toContain(
      "event=cleanup outcome=failed reason=workspace_list_failed",
    );
  });

  it("includes the underlying error in workspace_list_failed when teardown captured one", async () => {
    const cleaner = createCleaner({ config: makeConfig() });
    teardownMock.mockResolvedValue(
      emptyTeardownResult({
        workspaceProbe: { kind: "unavailable", error: new Error("cmux exploded") },
      }),
    );

    await cleaner.runOnce({
      state: boardOf([doneIssue("team-1")]),
      worktreeEntries: [hostEntryFor("repo-a", "team-1")],
      dryRun: false,
    });

    const out = consoleLog.output();
    expect(out).toContain("event=cleanup outcome=failed reason=workspace_list_failed");
    expect(out).toContain("cmux exploded");
  });

  it("logs workspace_close_failed for a workspace_close failure", async () => {
    const entry = hostEntryFor("repo-a", "team-1");
    const cleaner = createCleaner({ config: makeConfig() });
    teardownMock.mockResolvedValue(
      emptyTeardownResult({
        failures: [{ entry, step: "workspace_close", error: new Error("close down") }],
      }),
    );

    await cleaner.runOnce({
      state: boardOf([doneIssue("team-1")]),
      worktreeEntries: [entry],
      dryRun: false,
    });

    expect(consoleLog.output()).toContain("workspace close failed for team-1: close down");
    expect(consoleLog.output()).toContain(
      "event=cleanup outcome=failed reason=workspace_close_failed",
    );
  });

  it("logs Cleanup failed for a worktree_remove failure", async () => {
    const entry = hostEntryFor("repo-a", "team-1");
    const cleaner = createCleaner({ config: makeConfig() });
    teardownMock.mockResolvedValue(
      emptyTeardownResult({
        failures: [{ entry, step: "worktree_remove", error: new Error("cleanup boom") }],
      }),
    );

    await cleaner.runOnce({
      state: boardOf([doneIssue("team-1")]),
      worktreeEntries: [entry],
      dryRun: false,
    });

    expect(consoleLog.output()).toContain("Cleanup failed for team-1");
  });

  it("emits a dry-run notice and does not invoke teardown", async () => {
    const cleaner = createCleaner({ config: makeConfig() });

    await cleaner.runOnce({
      state: boardOf([doneIssue("team-1")]),
      worktreeEntries: [hostEntryFor("repo-a", "team-1")],
      dryRun: true,
    });

    expect(teardownMock).not.toHaveBeenCalled();
    const out = consoleLog.output();
    expect(out).toContain("[dry-run]");
    expect(out).toContain("worktree(s) due for cleanup");
    expect(out).toContain("event=cleanup outcome=skipped reason=dry_run");
  });

  it("passes both local and remote worktrees to teardown when both exist for one terminal ticket", async () => {
    const host = hostEntryFor("repo-a", "team-1");
    const sprite = spriteEntryFor("repo-a", "team-1");
    const cleaner = createCleaner({ config: makeConfig() });

    await cleaner.runOnce({
      state: boardOf([doneIssue("team-1")]),
      worktreeEntries: [host, sprite],
      dryRun: false,
    });

    expect(teardownMock).toHaveBeenCalledWith(expect.anything(), [host, sprite]);
  });

  it("passes a remote-kind worktree directly to teardown", async () => {
    const sprite = spriteEntryFor("repo-a", "team-1");
    const cleaner = createCleaner({ config: makeConfig() });

    await cleaner.runOnce({
      state: boardOf([doneIssue("team-1")]),
      worktreeEntries: [sprite],
      dryRun: false,
    });

    expect(teardownMock).toHaveBeenCalledWith(expect.anything(), [sprite]);
  });

  it("passes the shutdown signal into teardown", async () => {
    const { signal } = new AbortController();
    const entry = hostEntryFor("repo-a", "team-1");
    const cleaner = createCleaner({ config: makeConfig() });

    await cleaner.runOnce({
      state: boardOf([doneIssue("team-1")]),
      worktreeEntries: [entry],
      dryRun: false,
      signal,
    });

    expect(teardownMock).toHaveBeenCalledWith(expect.anything(), [entry], { signal });
  });
});
