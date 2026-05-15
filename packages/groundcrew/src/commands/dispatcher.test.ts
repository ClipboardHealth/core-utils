import type { LinearClient } from "@linear/sdk";

import type { BoardState, Issue } from "../lib/boardSource.ts";
import type { ResolvedConfig } from "../lib/config.ts";
import { EXHAUSTED_USAGE } from "../lib/usage.ts";
import { workspaces } from "../lib/workspaces.ts";
import type { WorktreeEntry } from "../lib/worktrees.ts";
import { captureConsoleLog, type ConsoleCapture } from "../testHelpers/consoleCapture.ts";
import { createDispatcher } from "./dispatcher.ts";
import { setupWorkspace } from "./setupWorkspace.ts";

vi.mock(import("./setupWorkspace.ts"), async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, setupWorkspace: vi.fn<typeof setupWorkspace>() };
});
vi.mock(import("../lib/workspaces.ts"), async (importOriginal) => {
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

const setupMock = vi.mocked(setupWorkspace);
const workspacesProbeMock = vi.mocked(workspaces.probe);

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
      knownRepositories: ["repo-a", "repo-b"],
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
      isolation: "auto",
      definitions: {
        claude: { cmd: "claude", color: "#fff" },
        codex: { cmd: "codex", color: "#000" },
      },
      ...overrides.models,
    },
    prompts: { initial: "x", ...overrides.prompts },
    workspaceKind: overrides.workspaceKind ?? "auto",
    logging: { file: "/tmp/groundcrew-test.log", ...overrides.logging },
    remote: {
      sprite: {
        spriteName: "crew-claude-1",
        owner: "ClipboardHealth",
        repoRoot: "/home/sprite/dev",
        worktreeRoot: "/home/sprite/groundcrew/worktrees",
        secretNames: ["NPM_TOKEN", "BUF_TOKEN"],
      },
      ...overrides.remote,
    },
  };
}

function todoIssue(overrides: Partial<Issue> = {}): Issue {
  return {
    id: "team-1",
    uuid: "uuid-1",
    title: "Title",
    status: "Todo",
    statusId: "state-todo",
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

function activeIssue(overrides: Partial<Issue> = {}): Issue {
  return todoIssue({ status: "In Progress", statusId: "state-active", ...overrides });
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

interface ClientStub {
  team: ReturnType<typeof vi.fn>;
  updateIssue: ReturnType<typeof vi.fn>;
}

function makeClient(options: { omitInProgressState?: boolean } = {}): ClientStub {
  const { omitInProgressState = false } = options;
  return {
    team: vi
      .fn<() => Promise<{ states: () => Promise<{ nodes: { id: string; name: string }[] }> }>>()
      .mockResolvedValue({
        states: vi
          .fn<() => Promise<{ nodes: { id: string; name: string }[] }>>()
          .mockResolvedValue({
            nodes: omitInProgressState
              ? [{ id: "state-other", name: "Other" }]
              : [{ id: "state-in-progress", name: "In Progress" }],
          }),
      }),
    updateIssue: vi.fn<() => Promise<Record<string, never>>>().mockResolvedValue({}),
  };
}

function asLinearClient(stub: ClientStub): LinearClient {
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- tests use the LinearClient surface consumed by dispatcher
  return stub as unknown as LinearClient;
}

describe(createDispatcher, () => {
  let consoleLog: ConsoleCapture;

  beforeEach(() => {
    consoleLog = captureConsoleLog();
    setupMock.mockResolvedValue();
    workspacesProbeMock.mockResolvedValue({ kind: "ok", names: new Set<string>() });
  });

  afterEach(() => {
    consoleLog.restore();
    vi.clearAllMocks();
  });

  describe("slot math", () => {
    it("starts a Todo ticket and marks it In Progress", async () => {
      const client = makeClient();
      const dispatcher = createDispatcher({ config: makeConfig(), client: asLinearClient(client) });

      await dispatcher.runOnce({
        state: boardOf([todoIssue()]),
        worktreeEntries: [],
        usage: async () => ({}),
        dryRun: false,
      });

      expect(setupMock).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          ticket: "team-1",
          repository: "repo-a",
          model: "claude",
          runner: "local",
        }),
      );
      expect(client.updateIssue).toHaveBeenCalledWith("uuid-1", { stateId: "state-in-progress" });
    });

    it("logs `At capacity` when no slots remain", async () => {
      const config = makeConfig({
        orchestrator: {
          maximumInProgress: 1,
          pollIntervalMilliseconds: 1,
          sessionLimitPercentage: 85,
        },
      });
      const client = makeClient();
      const dispatcher = createDispatcher({ config, client: asLinearClient(client) });

      await dispatcher.runOnce({
        state: boardOf([
          activeIssue({ id: "team-a" }),
          todoIssue({ id: "team-b", uuid: "uuid-b" }),
        ]),
        worktreeEntries: [],
        usage: async () => ({}),
        dryRun: false,
      });

      expect(setupMock).not.toHaveBeenCalled();
      expect(consoleLog.output()).toContain("At capacity");
    });

    it("logs `No Todo tickets` when nothing is queued", async () => {
      const client = makeClient();
      const dispatcher = createDispatcher({ config: makeConfig(), client: asLinearClient(client) });

      await dispatcher.runOnce({
        state: boardOf([activeIssue()]),
        worktreeEntries: [],
        usage: async () => ({}),
        dryRun: false,
      });

      expect(consoleLog.output()).toContain("No Todo tickets");
    });

    it("ignores Todo tickets without an agent-* label (model: undefined)", async () => {
      // Unlabeled Todo tickets reach the dispatcher in the board snapshot
      // but should be filtered out via isGroundcrewIssue before eligibility.
      const client = makeClient();
      const dispatcher = createDispatcher({ config: makeConfig(), client: asLinearClient(client) });

      await dispatcher.runOnce({
        state: boardOf([todoIssue({ model: undefined, repository: undefined })]),
        worktreeEntries: [],
        usage: async () => ({}),
        dryRun: false,
      });

      expect(setupMock).not.toHaveBeenCalled();
      expect(client.updateIssue).not.toHaveBeenCalled();
      expect(consoleLog.output()).toContain("No Todo tickets");
    });

    it("stops scanning Todo issues once eligible count reaches the slot cap", async () => {
      const config = makeConfig({
        orchestrator: {
          maximumInProgress: 1,
          pollIntervalMilliseconds: 1,
          sessionLimitPercentage: 85,
        },
      });
      const client = makeClient();
      const dispatcher = createDispatcher({ config, client: asLinearClient(client) });

      await dispatcher.runOnce({
        state: boardOf([
          todoIssue({ id: "team-1", uuid: "uuid-1" }),
          todoIssue({ id: "team-2", uuid: "uuid-2" }),
        ]),
        worktreeEntries: [],
        usage: async () => ({}),
        dryRun: false,
      });

      expect(setupMock).toHaveBeenCalledTimes(1);
    });
  });

  describe("blocker classification", () => {
    it("skips a ticket whose blocker is not in a terminal state", async () => {
      const client = makeClient();
      const dispatcher = createDispatcher({ config: makeConfig(), client: asLinearClient(client) });

      await dispatcher.runOnce({
        state: boardOf([
          todoIssue({
            blockers: [{ id: "team-0", title: "Blocker", status: "In Progress" }],
          }),
        ]),
        worktreeEntries: [],
        usage: async () => ({}),
        dryRun: false,
      });

      expect(setupMock).not.toHaveBeenCalled();
      expect(consoleLog.output()).toContain(
        "event=dispatch outcome=skipped reason=blocked ticket=team-1",
      );
    });

    it("dispatches a ticket whose blocker is terminal", async () => {
      const client = makeClient();
      const dispatcher = createDispatcher({ config: makeConfig(), client: asLinearClient(client) });

      await dispatcher.runOnce({
        state: boardOf([
          todoIssue({ blockers: [{ id: "team-0", title: "Blocker", status: "Done" }] }),
        ]),
        worktreeEntries: [],
        usage: async () => ({}),
        dryRun: false,
      });

      expect(setupMock).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ ticket: "team-1" }),
      );
    });

    it("conservatively skips a ticket when blocker pagination overflowed", async () => {
      const client = makeClient();
      const dispatcher = createDispatcher({ config: makeConfig(), client: asLinearClient(client) });

      await dispatcher.runOnce({
        state: boardOf([todoIssue({ hasMoreBlockers: true })]),
        worktreeEntries: [],
        usage: async () => ({}),
        dryRun: false,
      });

      expect(consoleLog.output()).toContain(
        "event=dispatch outcome=skipped reason=blockers_paginated",
      );
    });

    it("conservatively skips a ticket when a blocker state is missing", async () => {
      const client = makeClient();
      const dispatcher = createDispatcher({ config: makeConfig(), client: asLinearClient(client) });

      await dispatcher.runOnce({
        state: boardOf([
          todoIssue({ blockers: [{ id: "team-0", title: "Blocker", status: undefined }] }),
        ]),
        worktreeEntries: [],
        usage: async () => ({}),
        dryRun: false,
      });

      expect(setupMock).not.toHaveBeenCalled();
      expect(consoleLog.output()).toContain("blockers=team-0:missing");
    });

    // Regression: the lazy `usage` callback exists so all-blocked ticks don't
    // burn a codexbar HTTP call and a cmux/tmux shell-out for nothing.
    it("does not probe usage or workspaces when every Todo is blocked", async () => {
      const usageProbe = vi.fn<() => Promise<Record<string, never>>>().mockResolvedValue({});
      const client = makeClient();
      const dispatcher = createDispatcher({ config: makeConfig(), client: asLinearClient(client) });

      await dispatcher.runOnce({
        state: boardOf([
          todoIssue({
            id: "team-1",
            blockers: [{ id: "team-0", title: "Blocker", status: "In Progress" }],
          }),
          todoIssue({
            id: "team-2",
            uuid: "uuid-2",
            blockers: [{ id: "team-0", title: "Blocker", status: "In Progress" }],
          }),
        ]),
        worktreeEntries: [],
        usage: usageProbe,
        dryRun: false,
      });

      expect(usageProbe).not.toHaveBeenCalled();
      expect(workspacesProbeMock).not.toHaveBeenCalled();
      expect(consoleLog.output()).toContain("No eligible Todo tickets after blocker filtering");
    });
  });

  describe("agent-any resolution", () => {
    it("picks the model with the lowest session-used percent", async () => {
      const client = makeClient();
      const dispatcher = createDispatcher({ config: makeConfig(), client: asLinearClient(client) });

      await dispatcher.runOnce({
        state: boardOf([todoIssue({ model: "any" })]),
        worktreeEntries: [],
        usage: async () => ({
          claude: { session: 0.6, sessionEndDuration: 30, weekly: null, weekEndDuration: null },
          codex: { session: 0.2, sessionEndDuration: 30, weekly: null, weekEndDuration: null },
        }),
        dryRun: false,
      });

      expect(setupMock).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ model: "codex" }),
      );
      expect(consoleLog.output()).toContain("Resolved agent-any for team-1 → codex");
    });

    it("skips agent-any when every model is exhausted", async () => {
      const client = makeClient();
      const dispatcher = createDispatcher({ config: makeConfig(), client: asLinearClient(client) });

      await dispatcher.runOnce({
        state: boardOf([todoIssue({ model: "any" })]),
        worktreeEntries: [],
        usage: async () => ({
          claude: { session: 0.95, sessionEndDuration: 30, weekly: null, weekEndDuration: null },
          codex: { session: 0.95, sessionEndDuration: 30, weekly: null, weekEndDuration: null },
        }),
        dryRun: false,
      });

      expect(setupMock).not.toHaveBeenCalled();
      expect(consoleLog.output()).toContain("no model has available capacity");
    });
  });

  describe("eligibility", () => {
    it("resumes when worktree exists and a matching live workspace is present", async () => {
      workspacesProbeMock.mockResolvedValue({ kind: "ok", names: new Set(["team-1"]) });
      const client = makeClient();
      const dispatcher = createDispatcher({ config: makeConfig(), client: asLinearClient(client) });

      await dispatcher.runOnce({
        state: boardOf([todoIssue()]),
        worktreeEntries: [hostEntryFor("repo-a", "team-1")],
        usage: async () => ({}),
        dryRun: false,
      });

      expect(setupMock).not.toHaveBeenCalled();
      expect(client.updateIssue).toHaveBeenCalledWith("uuid-1", { stateId: "state-in-progress" });
      expect(consoleLog.output()).toContain("resuming with markInProgress");
    });

    it("skips when worktree exists but no live workspace matches", async () => {
      workspacesProbeMock.mockResolvedValue({ kind: "ok", names: new Set<string>() });
      const client = makeClient();
      const dispatcher = createDispatcher({ config: makeConfig(), client: asLinearClient(client) });

      await dispatcher.runOnce({
        state: boardOf([todoIssue()]),
        worktreeEntries: [hostEntryFor("repo-a", "team-1")],
        usage: async () => ({}),
        dryRun: false,
      });

      expect(setupMock).not.toHaveBeenCalled();
      expect(client.updateIssue).not.toHaveBeenCalled();
      expect(consoleLog.output()).toContain("Run `crew cleanup");
    });

    it("retries next iteration when the workspace list is unavailable", async () => {
      workspacesProbeMock.mockResolvedValue({ kind: "unavailable" });
      const client = makeClient();
      const dispatcher = createDispatcher({ config: makeConfig(), client: asLinearClient(client) });

      await dispatcher.runOnce({
        state: boardOf([todoIssue()]),
        worktreeEntries: [hostEntryFor("repo-a", "team-1")],
        usage: async () => ({}),
        dryRun: false,
      });

      expect(setupMock).not.toHaveBeenCalled();
      expect(consoleLog.output()).toContain("will retry next tick");
    });

    it("dry-run logs `Would start` without invoking setupWorkspace", async () => {
      const client = makeClient();
      const dispatcher = createDispatcher({ config: makeConfig(), client: asLinearClient(client) });

      await dispatcher.runOnce({
        state: boardOf([todoIssue()]),
        worktreeEntries: [],
        usage: async () => ({}),
        dryRun: true,
      });

      expect(setupMock).not.toHaveBeenCalled();
      expect(consoleLog.output()).toContain("[dry-run] Would start team-1");
      expect(consoleLog.output()).toContain("(claude, local)");
    });

    it("passes the Sprite runner through to setupWorkspace and event logs", async () => {
      const client = makeClient();
      const dispatcher = createDispatcher({ config: makeConfig(), client: asLinearClient(client) });

      await dispatcher.runOnce({
        state: boardOf([todoIssue({ runner: "sprite" })]),
        worktreeEntries: [],
        usage: async () => ({}),
        dryRun: false,
      });

      expect(setupMock).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ ticket: "team-1", runner: "sprite" }),
      );
      expect(consoleLog.output()).toContain(
        "event=dispatch outcome=started ticket=team-1 model=claude repository=repo-a runner=sprite",
      );
    });

    it("rethrows workspace probe failures after attaching a usage rejection handler", async () => {
      const client = makeClient();
      const dispatcher = createDispatcher({ config: makeConfig(), client: asLinearClient(client) });
      const usageProbe = vi
        .fn<() => Promise<Record<string, never>>>()
        .mockRejectedValue(new Error("usage failed"));
      workspacesProbeMock.mockRejectedValue(new Error("probe failed"));

      await expect(
        dispatcher.runOnce({
          state: boardOf([todoIssue()]),
          worktreeEntries: [],
          usage: usageProbe,
          dryRun: false,
        }),
      ).rejects.toThrow("probe failed");
    });
  });

  describe("session limits", () => {
    it("skips a Todo ticket whose model is over the session limit", async () => {
      const client = makeClient();
      const dispatcher = createDispatcher({ config: makeConfig(), client: asLinearClient(client) });

      await dispatcher.runOnce({
        state: boardOf([todoIssue()]),
        worktreeEntries: [],
        usage: async () => ({
          claude: { session: 0.95, sessionEndDuration: 30, weekly: null, weekEndDuration: null },
        }),
        dryRun: false,
      });

      expect(setupMock).not.toHaveBeenCalled();
      expect(consoleLog.output()).toContain("session at 95%");
    });

    it("treats EXHAUSTED_USAGE as exhausted at sessionLimitPercentage=100", async () => {
      const client = makeClient();
      const dispatcher = createDispatcher({
        config: makeConfig({
          orchestrator: {
            maximumInProgress: 2,
            pollIntervalMilliseconds: 1000,
            sessionLimitPercentage: 100,
          },
        }),
        client: asLinearClient(client),
      });

      await dispatcher.runOnce({
        state: boardOf([todoIssue()]),
        worktreeEntries: [],
        usage: async () => ({ claude: EXHAUSTED_USAGE }),
        dryRun: false,
      });

      expect(setupMock).not.toHaveBeenCalled();
      expect(consoleLog.output()).toContain("(> 100%)");
    });
  });

  describe("weekly paced budget", () => {
    // Week = 7 days = 10080 minutes. weekEndDuration is "minutes until
    // the weekly window resets" — codexbar's signal for how much of the
    // week is left.
    const MINUTES_PER_DAY = 24 * 60;
    const MINUTES_PER_WEEK = 7 * MINUTES_PER_DAY;
    const dayEnd = (n: number): number => MINUTES_PER_WEEK - n * MINUTES_PER_DAY;

    it("does not gate when weekly usage is below the current day budget", async () => {
      // End of day 3 → 3/7 = 42.86% allowed. Used 30% — well under the line.
      const client = makeClient();
      const dispatcher = createDispatcher({ config: makeConfig(), client: asLinearClient(client) });

      await dispatcher.runOnce({
        state: boardOf([todoIssue()]),
        worktreeEntries: [],
        usage: async () => ({
          claude: {
            session: 0.1,
            sessionEndDuration: 30,
            weekly: 0.3,
            weekEndDuration: dayEnd(3),
          },
        }),
        dryRun: false,
      });

      expect(setupMock).toHaveBeenCalledTimes(1);
    });

    it("allows the first-day budget immediately after weekly rollover", async () => {
      // 19 minutes after rollover is still day 1, so 1/7 = 14.29% is allowed.
      const client = makeClient();
      const dispatcher = createDispatcher({ config: makeConfig(), client: asLinearClient(client) });

      await dispatcher.runOnce({
        state: boardOf([todoIssue({ model: "codex" })]),
        worktreeEntries: [],
        usage: async () => ({
          codex: {
            session: 0.1,
            sessionEndDuration: 30,
            weekly: 0.01,
            weekEndDuration: MINUTES_PER_WEEK - 19,
          },
        }),
        dryRun: false,
      });

      expect(setupMock).toHaveBeenCalledTimes(1);
      expect(consoleLog.output()).not.toContain("paced budget");
    });

    it("gates when weekly usage exceeds the current day budget", async () => {
      // End of day 1 → 1/7 = 14.29% allowed. Used 20% — over the line.
      const client = makeClient();
      const dispatcher = createDispatcher({ config: makeConfig(), client: asLinearClient(client) });

      await dispatcher.runOnce({
        state: boardOf([todoIssue()]),
        worktreeEntries: [],
        usage: async () => ({
          claude: {
            session: 0.1,
            sessionEndDuration: 30,
            weekly: 0.2,
            weekEndDuration: dayEnd(1),
          },
        }),
        dryRun: false,
      });

      expect(setupMock).not.toHaveBeenCalled();
      expect(consoleLog.output()).toContain("claude weekly at 20.0% (> 14.3% paced budget)");
      expect(consoleLog.output()).toContain(`resets in ${dayEnd(1)}m`);
      expect(consoleLog.output()).toContain(
        "event=dispatch outcome=skipped reason=model_exhausted",
      );
    });

    // The contract is strict `>`. Pin the equality case so a future
    // refactor to `>=` can't silently start benching models early.
    it("does not gate when weekly usage exactly equals the current day budget", async () => {
      // Mid-week (3.5 days in) is day 4's bucket, and used exactly 4/7.
      const client = makeClient();
      const dispatcher = createDispatcher({ config: makeConfig(), client: asLinearClient(client) });

      await dispatcher.runOnce({
        state: boardOf([todoIssue()]),
        worktreeEntries: [],
        usage: async () => ({
          claude: {
            session: 0.1,
            sessionEndDuration: 30,
            weekly: 4 / 7,
            weekEndDuration: MINUTES_PER_WEEK / 2,
          },
        }),
        dryRun: false,
      });

      expect(setupMock).toHaveBeenCalledTimes(1);
      expect(consoleLog.output()).not.toContain("paced budget");
    });

    // From the user's example: day 2 of the week with 0% interactive
    // usage gives nightly agents the full 2/7 = 28.57% budget — i.e.,
    // catch-up usage is permitted when behind the pace.
    it("permits catch-up usage when behind the pace", async () => {
      const client = makeClient();
      const dispatcher = createDispatcher({ config: makeConfig(), client: asLinearClient(client) });

      await dispatcher.runOnce({
        state: boardOf([todoIssue()]),
        worktreeEntries: [],
        usage: async () => ({
          // 25% used at end of day 2 → allowed 28.57%, still under the line.
          claude: {
            session: 0.1,
            sessionEndDuration: 30,
            weekly: 0.25,
            weekEndDuration: dayEnd(2),
          },
        }),
        dryRun: false,
      });

      expect(setupMock).toHaveBeenCalledTimes(1);
    });

    it("ignores a null weekly value (no codexbar secondary window)", async () => {
      const client = makeClient();
      const dispatcher = createDispatcher({ config: makeConfig(), client: asLinearClient(client) });

      await dispatcher.runOnce({
        state: boardOf([todoIssue()]),
        worktreeEntries: [],
        usage: async () => ({
          claude: { session: 0.1, sessionEndDuration: 30, weekly: null, weekEndDuration: null },
        }),
        dryRun: false,
      });

      expect(setupMock).toHaveBeenCalledTimes(1);
    });

    it("ignores a null weekEndDuration (can't compute pace this tick)", async () => {
      const client = makeClient();
      const dispatcher = createDispatcher({ config: makeConfig(), client: asLinearClient(client) });

      await dispatcher.runOnce({
        state: boardOf([todoIssue()]),
        worktreeEntries: [],
        usage: async () => ({
          // Without weekEndDuration the dispatcher can't locate us in the
          // week, so the gate stays open even though 99% is over any
          // reasonable line.
          claude: {
            session: 0.1,
            sessionEndDuration: 30,
            weekly: 0.99,
            weekEndDuration: null,
          },
        }),
        dryRun: false,
      });

      expect(setupMock).toHaveBeenCalledTimes(1);
      expect(consoleLog.output()).not.toContain("paced budget");
    });

    it("clamps elapsed day to the valid week when codexbar reports an out-of-range duration", async () => {
      // Anomalous weekEndDuration > MINUTES_PER_WEEK (e.g., codexbar
      // returned a value from before the window started). Elapsed should
      // clamp to the first day bucket, so usage over 1/7 trips the gate.
      const client = makeClient();
      const dispatcher = createDispatcher({ config: makeConfig(), client: asLinearClient(client) });

      await dispatcher.runOnce({
        state: boardOf([todoIssue()]),
        worktreeEntries: [],
        usage: async () => ({
          claude: {
            session: 0.1,
            sessionEndDuration: 30,
            weekly: 0.2,
            weekEndDuration: MINUTES_PER_WEEK + 5000,
          },
        }),
        dryRun: false,
      });

      expect(setupMock).not.toHaveBeenCalled();
      expect(consoleLog.output()).toContain("claude weekly at 20.0% (> 14.3% paced budget)");
    });

    it("does not double-gate when weekly is Infinity (session gate handles EXHAUSTED_USAGE)", async () => {
      const client = makeClient();
      const dispatcher = createDispatcher({ config: makeConfig(), client: asLinearClient(client) });

      await dispatcher.runOnce({
        state: boardOf([todoIssue()]),
        worktreeEntries: [],
        usage: async () => ({ claude: EXHAUSTED_USAGE }),
        dryRun: false,
      });

      expect(setupMock).not.toHaveBeenCalled();
      // Session gate's log fires; weekly gate's "paced budget" log doesn't.
      const output = consoleLog.output();
      expect(output).toContain("session at Infinity%");
      expect(output).not.toContain("paced budget");
    });
  });

  describe("team-state cache", () => {
    it("fetches the In-Progress state once across multiple tickets in the same team", async () => {
      const client = makeClient();
      const dispatcher = createDispatcher({ config: makeConfig(), client: asLinearClient(client) });

      await dispatcher.runOnce({
        state: boardOf([
          todoIssue({ id: "team-1", uuid: "uuid-1", teamId: "shared" }),
          todoIssue({ id: "team-2", uuid: "uuid-2", teamId: "shared" }),
        ]),
        worktreeEntries: [],
        usage: async () => ({}),
        dryRun: false,
      });

      expect(client.team).toHaveBeenCalledTimes(1);
    });

    it("reuses the cached state across multiple runOnce invocations", async () => {
      const client = makeClient();
      const dispatcher = createDispatcher({ config: makeConfig(), client: asLinearClient(client) });

      await dispatcher.runOnce({
        state: boardOf([todoIssue({ id: "team-1", uuid: "uuid-1", teamId: "shared" })]),
        worktreeEntries: [],
        usage: async () => ({}),
        dryRun: false,
      });
      await dispatcher.runOnce({
        state: boardOf([todoIssue({ id: "team-2", uuid: "uuid-2", teamId: "shared" })]),
        worktreeEntries: [],
        usage: async () => ({}),
        dryRun: false,
      });

      expect(client.team).toHaveBeenCalledTimes(1);
      expect(client.updateIssue).toHaveBeenCalledTimes(2);
    });

    it("logs and continues when the team has no In-Progress state", async () => {
      const client = makeClient({ omitInProgressState: true });
      const dispatcher = createDispatcher({ config: makeConfig(), client: asLinearClient(client) });

      await dispatcher.runOnce({
        state: boardOf([todoIssue()]),
        worktreeEntries: [],
        usage: async () => ({}),
        dryRun: false,
      });

      expect(consoleLog.output()).toContain('Could not find "In Progress" state');
    });

    it("dedupes a misconfigured-team lookup within an iteration", async () => {
      const client = makeClient({ omitInProgressState: true });
      const dispatcher = createDispatcher({ config: makeConfig(), client: asLinearClient(client) });

      await dispatcher.runOnce({
        state: boardOf([
          todoIssue({ id: "team-1", uuid: "uuid-1", teamId: "broken" }),
          todoIssue({ id: "team-2", uuid: "uuid-2", teamId: "broken" }),
          todoIssue({ id: "team-3", uuid: "uuid-3", teamId: "broken" }),
        ]),
        worktreeEntries: [],
        usage: async () => ({}),
        dryRun: false,
      });

      expect(client.team).toHaveBeenCalledTimes(1);
    });

    it("re-fetches a misconfigured team next iteration so a Linear-side fix auto-recovers", async () => {
      const client = makeClient({ omitInProgressState: true });
      const dispatcher = createDispatcher({ config: makeConfig(), client: asLinearClient(client) });

      await dispatcher.runOnce({
        state: boardOf([todoIssue({ id: "team-1", uuid: "uuid-1", teamId: "broken" })]),
        worktreeEntries: [],
        usage: async () => ({}),
        dryRun: false,
      });
      await dispatcher.runOnce({
        state: boardOf([todoIssue({ id: "team-2", uuid: "uuid-2", teamId: "broken" })]),
        worktreeEntries: [],
        usage: async () => ({}),
        dryRun: false,
      });

      expect(client.team).toHaveBeenCalledTimes(2);
    });
  });

  describe("setup failures", () => {
    it("logs setupWorkspace failures without crashing the loop", async () => {
      setupMock.mockRejectedValue(new Error("boom"));
      const client = makeClient();
      const dispatcher = createDispatcher({ config: makeConfig(), client: asLinearClient(client) });

      await dispatcher.runOnce({
        state: boardOf([todoIssue()]),
        worktreeEntries: [],
        usage: async () => ({}),
        dryRun: false,
      });

      expect(consoleLog.output()).toContain("Failed to start team-1: boom");
    });
  });
});
