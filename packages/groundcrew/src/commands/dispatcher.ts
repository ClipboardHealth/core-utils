/**
 * Per-iteration decider that picks Todo tickets to start and acts on the
 * picks. One per `orchestrate()` invocation; reuses its team-state cache
 * across iterations within an invocation.
 *
 * Pure verdict logic lives in `eligibility.ts`; this module is responsible
 * for telemetry, Linear writes, and side-effecting setupWorkspace calls.
 */

import type { LinearClient } from "@linear/sdk";

import type { BoardState, Issue } from "../lib/boardSource.ts";
import type { ResolvedConfig } from "../lib/config.ts";
import type { UsageByModel } from "../lib/usage.ts";
import { errorMessage, log, logEvent } from "../lib/util.ts";
import { type WorkspaceProbe, workspaces } from "../lib/workspaces.ts";
import type { WorktreeEntry } from "../lib/worktrees.ts";
import {
  classifyBlockers,
  classifyEligibility,
  type SkipVerdict,
  type StartVerdict,
} from "./eligibility.ts";
import { setupWorkspace } from "./setupWorkspace.ts";

const PERCENT_FRACTION_DIVISOR = 100;
const DAYS_PER_WEEK = 7;
const MINUTES_PER_DAY = 24 * 60;
const MINUTES_PER_WEEK = DAYS_PER_WEEK * MINUTES_PER_DAY;

interface DispatcherDeps {
  config: ResolvedConfig;
  client: LinearClient;
}

export interface Dispatcher {
  runOnce(arguments_: {
    state: BoardState;
    worktreeEntries: readonly WorktreeEntry[];
    /** Lazy so dispatcher can early-return on idle ticks without paying the codexbar shell-out. */
    usage: (signal?: AbortSignal) => Promise<UsageByModel>;
    dryRun: boolean;
    signal?: AbortSignal;
  }): Promise<void>;
}

export function createDispatcher(deps: DispatcherDeps): Dispatcher {
  const { config, client } = deps;
  const inProgressStateByTeam = new Map<string, string>();
  let teamsMissingInProgress = new Set<string>();

  function buildExhaustedSet(usage: UsageByModel): Set<string> {
    const exhausted = new Set<string>();
    const sessionLimit = config.orchestrator.sessionLimitPercentage;
    for (const [model, snapshot] of Object.entries(usage)) {
      if (snapshot.session !== null && snapshot.session * PERCENT_FRACTION_DIVISOR > sessionLimit) {
        exhausted.add(model);
        const pct = (snapshot.session * PERCENT_FRACTION_DIVISOR).toFixed(0);
        const mins = snapshot.sessionEndDuration ?? "?";
        log(
          `${model} session at ${pct}% (> ${sessionLimit}%), resets in ${mins}m — skipping its tickets`,
        );
      }
      // Weekly gate paces total weekly usage against day buckets from the
      // weekly reset. Day 1's budget is available immediately after rollover,
      // then each later day opens another 1/7 of the weekly budget. Skipped when:
      //   - weekly is null (no codexbar secondary window this tick)
      //   - weekly is non-finite (EXHAUSTED_USAGE — session gate above
      //     already pins it to Infinity)
      //   - weekEndDuration is null (can't compute where we are in week)
      if (
        snapshot.weekly !== null &&
        Number.isFinite(snapshot.weekly) &&
        snapshot.weekEndDuration !== null
      ) {
        const usedPct = snapshot.weekly * PERCENT_FRACTION_DIVISOR;
        const allowedPct = weeklyPacedBudgetPercentage(snapshot.weekEndDuration);
        if (usedPct > allowedPct) {
          exhausted.add(model);
          log(
            `${model} weekly at ${usedPct.toFixed(1)}% (> ${allowedPct.toFixed(1)}% paced budget), resets in ${snapshot.weekEndDuration}m — skipping its tickets`,
          );
        }
      }
    }
    return exhausted;
  }

  async function getInProgressStateId(teamId: string): Promise<string | undefined> {
    if (teamId.length === 0) {
      return undefined;
    }
    const cached = inProgressStateByTeam.get(teamId);
    if (cached !== undefined) {
      return cached;
    }
    // Negative cache is per-iteration so a team that's fixed in Linear during
    // a `crew watch` session auto-recovers next tick. Within one iteration,
    // every eligible ticket in a misconfigured team would otherwise re-fetch.
    if (teamsMissingInProgress.has(teamId)) {
      return undefined;
    }

    const team = await client.team(teamId);
    const states = await team.states();
    const inProgress = states.nodes.find(
      (state) => state.name === config.linear.statuses.inProgress,
    );
    if (inProgress?.id === undefined) {
      teamsMissingInProgress.add(teamId);
      return undefined;
    }
    inProgressStateByTeam.set(teamId, inProgress.id);
    return inProgress.id;
  }

  async function markInProgress(issue: Issue): Promise<void> {
    const stateId = await getInProgressStateId(issue.teamId);
    if (stateId === undefined) {
      // Throw rather than log+return: if we silently swallowed this, the
      // ticket would stay Todo forever while the workspace runs, which means
      // every iteration re-enters the recovery path and the agent never
      // counts toward maximumInProgress.
      throw new Error(
        `Could not find "${config.linear.statuses.inProgress}" state for ${issue.id} (team ${issue.teamId.length > 0 ? issue.teamId : "?"}). Verify the status name in linear.statuses.inProgress matches the team's workflow.`,
      );
    }
    await client.updateIssue(issue.uuid, { stateId });
    log(`Marked ${issue.id} as ${config.linear.statuses.inProgress}`);
  }

  function logSkip(verdict: SkipVerdict): void {
    log(verdict.message);
    logEvent("dispatch", {
      outcome: "skipped",
      reason: verdict.eventReason,
      ticket: verdict.issue.id,
      blockers: verdict.blockers,
      model: verdict.model,
    });
  }

  async function startEligibleIssue(
    start: StartVerdict,
    dryRun: boolean,
    signal?: AbortSignal,
  ): Promise<void> {
    const { issue, recovery } = start;
    if (start.resolvedFromAny) {
      log(`Resolved agent-any for ${issue.id} → ${issue.model}`);
    }

    if (dryRun) {
      log(
        /* v8 ignore next @preserve -- classifyTodo forces recovery=false in dry-run, so the resume branch can't fire here */
        `[dry-run] Would ${recovery ? "resume" : "start"} ${issue.id} in ${issue.repository} (${issue.model})`,
      );
      logEvent("dispatch", {
        outcome: "skipped",
        reason: "dry_run",
        ticket: issue.id,
        model: issue.model,
        repository: issue.repository,
      });
      return;
    }

    try {
      if (recovery) {
        log(`Worktree and workspace already exist for ${issue.id}; resuming with markInProgress`);
      } else {
        const setupOptions = {
          repository: issue.repository,
          ticket: issue.id,
          model: issue.model,
        };
        await (signal === undefined
          ? setupWorkspace(config, setupOptions)
          : setupWorkspace(config, setupOptions, { signal }));
      }
      await markInProgress(issue);
      logEvent("dispatch", {
        outcome: recovery ? "resumed" : "started",
        ticket: issue.id,
        model: issue.model,
        repository: issue.repository,
      });
    } catch (error) {
      log(`Failed to start ${issue.id}: ${errorMessage(error)}`);
      logEvent("dispatch", {
        outcome: "failed",
        ticket: issue.id,
        model: issue.model,
        repository: issue.repository,
        error: errorMessage(error),
      });
    }
  }

  async function runOnce(arguments_: {
    state: BoardState;
    worktreeEntries: readonly WorktreeEntry[];
    usage: (signal?: AbortSignal) => Promise<UsageByModel>;
    dryRun: boolean;
    signal?: AbortSignal;
  }): Promise<void> {
    const { state, worktreeEntries, usage, dryRun, signal } = arguments_;
    teamsMissingInProgress = new Set();

    const activeCount = state.issues.filter(
      (issue) => issue.status === config.linear.statuses.inProgress,
    ).length;
    const slots = config.orchestrator.maximumInProgress - activeCount;
    const todo = state.issues.filter((issue) => issue.status === config.linear.statuses.todo);

    if (slots <= 0) {
      log(
        `At capacity (${activeCount}/${config.orchestrator.maximumInProgress}), no new work to start`,
      );
      return;
    }

    if (todo.length === 0) {
      log(`No ${config.linear.statuses.todo} tickets to pick up`);
      return;
    }

    // Run the blocker pre-pass first so an all-blocked board short-circuits
    // before the codexbar HTTP call and the cmux/tmux shell-out fire.
    const { unblocked, skips: blockerSkips } = classifyBlockers(config, todo);
    for (const skip of blockerSkips) {
      logSkip(skip);
    }
    if (unblocked.length === 0) {
      log(`No eligible ${config.linear.statuses.todo} tickets after blocker filtering`);
      return;
    }

    // usage() is an HTTP call; workspaces.probe shells tmux/cmux. Kick off
    // usage first so the workspace probe can overlap with the in-flight request.
    const usagePromise = usage(signal);
    // Snapshot live workspace names once per iteration so eligibility can
    // distinguish "worktree exists AND its agent is still running" (resume)
    // from "worktree exists but the workspace is gone" (ambiguous — don't
    // auto-recover). Done before slot-counting so a skipped stale ticket
    // doesn't consume an eligible slot and starve later Todo tickets.
    let workspaceProbe: WorkspaceProbe;
    try {
      workspaceProbe = dryRun
        ? { kind: "ok", names: new Set<string>() }
        : await workspaces.probe(config, signal);
    } catch (error) {
      usagePromise.catch(() => "ignored");
      throw error;
    }
    const fetchedUsage = await usagePromise;
    const exhausted = buildExhaustedSet(fetchedUsage);

    const verdicts = classifyEligibility({
      config,
      unblocked,
      worktreeEntries,
      workspaceProbe,
      usage: fetchedUsage,
      exhausted,
      slots,
      dryRun,
    });

    const starts = verdicts.filter((v): v is StartVerdict => v.kind === "start");
    const skips = verdicts.filter((v): v is SkipVerdict => v.kind === "skip");

    for (const skip of skips) {
      logSkip(skip);
    }

    if (starts.length === 0) {
      log(`No eligible ${config.linear.statuses.todo} tickets after eligibility filtering`);
      return;
    }

    log(
      `${slots} slot(s) available, starting ${starts.length} ticket(s): ${starts.map(({ issue }) => `${issue.id}(${issue.model})`).join(", ")}`,
    );
    logEvent("dispatch", {
      outcome: "starting",
      tickets: starts.map(({ issue }) => `${issue.id}:${issue.model}`),
    });

    for (const start of starts) {
      // oxlint-disable-next-line no-await-in-loop -- one workspace at a time avoids racing on git
      await startEligibleIssue(start, dryRun, signal);
    }
  }

  return { runOnce };
}

function weeklyPacedBudgetPercentage(weekEndDuration: number): number {
  const elapsedMinutes = Math.min(
    MINUTES_PER_WEEK,
    Math.max(0, MINUTES_PER_WEEK - weekEndDuration),
  );
  const elapsedDayCount = Math.ceil(elapsedMinutes / MINUTES_PER_DAY);
  const budgetDayCount = Math.min(DAYS_PER_WEEK, Math.max(1, elapsedDayCount));

  return (budgetDayCount / DAYS_PER_WEEK) * PERCENT_FRACTION_DIVISOR;
}
