import type { GroundcrewIssue } from "../lib/boardSource.ts";
import type { ResolvedConfig } from "../lib/config.ts";
import type { UsageByModel } from "../lib/usage.ts";
import type { WorktreeEntry } from "../lib/worktrees.ts";
import {
  type ClassifyArguments,
  classifyBlockers,
  classifyEligibility,
  pickBestModel,
} from "./eligibility.ts";

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
      maximumInProgress: 4,
      pollIntervalMilliseconds: 1000,
      sessionLimitPercentage: 85,
      ...overrides.orchestrator,
    },
    models: {
      default: "claude",
      definitions: {
        claude: { cmd: "claude", color: "#fff" },
        codex: { cmd: "codex", color: "#000" },
      },
      ...overrides.models,
    },
    prompts: { initial: "x", ...overrides.prompts },
    workspaceKind: overrides.workspaceKind ?? "auto",
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
    logging: { file: "/tmp/groundcrew-test.log", ...overrides.logging },
  };
}

function todoIssue(overrides: Partial<GroundcrewIssue> = {}): GroundcrewIssue {
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

function hostEntryFor(repository: string, ticket: string): WorktreeEntry {
  return {
    repository,
    ticket,
    branchName: `rocky-${ticket.toLowerCase()}`,
    dir: `/work/${repository}-${ticket}`,
    kind: "host",
  };
}

function defaultArguments(overrides: Partial<ClassifyArguments> = {}): ClassifyArguments {
  return {
    config: makeConfig(),
    unblocked: [todoIssue()],
    worktreeEntries: [],
    workspaceProbe: { kind: "ok", names: new Set<string>() },
    usage: {},
    exhausted: new Set<string>(),
    slots: 4,
    dryRun: false,
    ...overrides,
  };
}

describe(classifyBlockers, () => {
  it("emits a `blocked` skip when a blocker is in a non-terminal state", () => {
    const { unblocked, skips } = classifyBlockers(makeConfig(), [
      todoIssue({ blockers: [{ id: "team-0", title: "B", status: "In Progress" }] }),
    ]);

    expect(unblocked).toHaveLength(0);
    expect(skips).toHaveLength(1);
    expect(skips[0]).toMatchObject({
      kind: "skip",
      eventReason: "blocked",
      blockers: ["team-0:In Progress"],
    });
  });

  it("emits a `blockers_paginated` skip when blocker pagination overflowed", () => {
    const { skips } = classifyBlockers(makeConfig(), [todoIssue({ hasMoreBlockers: true })]);

    expect(skips[0]).toMatchObject({ kind: "skip", eventReason: "blockers_paginated" });
  });

  it("emits a `blocked` skip when the blocker state is missing", () => {
    const { skips } = classifyBlockers(makeConfig(), [
      todoIssue({ blockers: [{ id: "team-0", title: "B", status: undefined }] }),
    ]);

    expect(skips[0]).toMatchObject({
      kind: "skip",
      eventReason: "blocked",
      blockers: ["team-0:missing"],
    });
  });

  it("returns the issue as unblocked when its blocker is already terminal", () => {
    const { unblocked, skips } = classifyBlockers(makeConfig(), [
      todoIssue({ blockers: [{ id: "team-0", title: "B", status: "Done" }] }),
    ]);

    expect(unblocked).toHaveLength(1);
    expect(skips).toHaveLength(0);
  });

  it("partitions a mixed batch into unblocked and skip lists", () => {
    const { unblocked, skips } = classifyBlockers(makeConfig(), [
      todoIssue({ id: "team-1", uuid: "uuid-1" }),
      todoIssue({
        id: "team-2",
        uuid: "uuid-2",
        blockers: [{ id: "team-0", title: "B", status: "In Progress" }],
      }),
      todoIssue({ id: "team-3", uuid: "uuid-3" }),
    ]);

    expect(unblocked.map((issue) => issue.id)).toStrictEqual(["team-1", "team-3"]);
    expect(skips.map((skip) => skip.issue.id)).toStrictEqual(["team-2"]);
  });
});

describe(classifyEligibility, () => {
  describe("agent-any resolution", () => {
    it("resolves agent-any to the model with the most session capacity", () => {
      const verdicts = classifyEligibility(
        defaultArguments({
          unblocked: [todoIssue({ model: "any" })],
          usage: {
            claude: { session: 0.6, sessionEndDuration: 30, weekly: null, weekEndDuration: null },
            codex: { session: 0.2, sessionEndDuration: 30, weekly: null, weekEndDuration: null },
          },
        }),
      );

      expect(verdicts[0]).toMatchObject({
        kind: "start",
        resolvedFromAny: true,
        issue: { model: "codex" },
      });
    });

    it("emits `agent_any_capacity` when every model is exhausted", () => {
      const verdicts = classifyEligibility(
        defaultArguments({
          unblocked: [todoIssue({ model: "any" })],
          exhausted: new Set(["claude", "codex"]),
        }),
      );

      expect(verdicts[0]).toMatchObject({ kind: "skip", eventReason: "agent_any_capacity" });
    });

    it("excludes exhausted models from agent-any resolution", () => {
      const verdicts = classifyEligibility(
        defaultArguments({
          unblocked: [todoIssue({ model: "any" })],
          exhausted: new Set(["claude"]),
          usage: {
            claude: { session: 0.1, sessionEndDuration: 30, weekly: null, weekEndDuration: null },
            codex: { session: 0.4, sessionEndDuration: 30, weekly: null, weekEndDuration: null },
          },
        }),
      );

      expect(verdicts[0]).toMatchObject({
        kind: "start",
        issue: { model: "codex" },
      });
    });

    it("does not flag resolvedFromAny when the model was already concrete", () => {
      const verdicts = classifyEligibility(
        defaultArguments({ unblocked: [todoIssue({ model: "claude" })] }),
      );

      expect(verdicts[0]).toMatchObject({ kind: "start", resolvedFromAny: false });
    });
  });

  describe("session exhaustion", () => {
    it("skips a concrete-model ticket when its model is exhausted", () => {
      const verdicts = classifyEligibility(
        defaultArguments({
          unblocked: [todoIssue({ model: "claude" })],
          exhausted: new Set(["claude"]),
        }),
      );

      expect(verdicts[0]).toMatchObject({ kind: "skip", eventReason: "model_exhausted" });
    });
  });

  describe("workspace recovery", () => {
    it("starts as recovery=true when worktree exists and a live workspace matches", () => {
      const verdicts = classifyEligibility(
        defaultArguments({
          worktreeEntries: [hostEntryFor("repo-a", "team-1")],
          workspaceProbe: { kind: "ok", names: new Set(["team-1"]) },
        }),
      );

      expect(verdicts[0]).toMatchObject({ kind: "start", recovery: true });
    });

    it("emits `workspace_missing` when the worktree exists but no live workspace matches", () => {
      const verdicts = classifyEligibility(
        defaultArguments({
          worktreeEntries: [hostEntryFor("repo-a", "team-1")],
          workspaceProbe: { kind: "ok", names: new Set<string>() },
        }),
      );

      expect(verdicts[0]).toMatchObject({ kind: "skip", eventReason: "workspace_missing" });
    });

    it("emits `workspace_list_unavailable` when the workspace adapter probe failed", () => {
      const verdicts = classifyEligibility(
        defaultArguments({
          worktreeEntries: [hostEntryFor("repo-a", "team-1")],
          workspaceProbe: { kind: "unavailable" },
        }),
      );

      expect(verdicts[0]).toMatchObject({
        kind: "skip",
        eventReason: "workspace_list_unavailable",
      });
    });

    it("starts as recovery=false when the worktree exists but dry-run skips the probe", () => {
      const verdicts = classifyEligibility(
        defaultArguments({
          worktreeEntries: [hostEntryFor("repo-a", "team-1")],
          workspaceProbe: { kind: "ok", names: new Set<string>() },
          dryRun: true,
        }),
      );

      expect(verdicts[0]).toMatchObject({ kind: "start", recovery: false });
    });
  });

  describe("slot cap", () => {
    it("stops producing start verdicts once the slot cap is reached", () => {
      const verdicts = classifyEligibility(
        defaultArguments({
          slots: 1,
          unblocked: [
            todoIssue({ id: "team-1", uuid: "uuid-1" }),
            todoIssue({ id: "team-2", uuid: "uuid-2" }),
          ],
        }),
      );

      expect(verdicts).toHaveLength(1);
      expect(verdicts[0]).toMatchObject({ kind: "start", issue: { id: "team-1" } });
    });
  });
});

describe(pickBestModel, () => {
  it("returns undefined when every model is exhausted", () => {
    expect(pickBestModel(makeConfig(), {}, new Set(["claude", "codex"]))).toBeUndefined();
  });

  it("falls back to the default model when no usage data is available", () => {
    expect(pickBestModel(makeConfig(), {}, new Set())).toBe("claude");
  });

  it("breaks ties in favor of the default model", () => {
    const usage: UsageByModel = {
      claude: { session: 0.5, sessionEndDuration: 30, weekly: null, weekEndDuration: null },
      codex: { session: 0.5, sessionEndDuration: 30, weekly: null, weekEndDuration: null },
    };
    expect(pickBestModel(makeConfig(), usage, new Set())).toBe("claude");
  });

  it("picks the model with the lowest session score", () => {
    const usage: UsageByModel = {
      claude: { session: 0.7, sessionEndDuration: 30, weekly: null, weekEndDuration: null },
      codex: { session: 0.3, sessionEndDuration: 30, weekly: null, weekEndDuration: null },
    };
    expect(pickBestModel(makeConfig(), usage, new Set())).toBe("codex");
  });
});
