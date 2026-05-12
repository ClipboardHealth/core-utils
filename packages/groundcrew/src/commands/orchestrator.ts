/**
 * groundcrew orchestrator — polls a Linear project and spins up
 * workspace + git-worktree pairs for ready tickets.
 */

import {
  type BoardSource,
  type BoardState,
  createBoardSource,
  type Issue,
  isTerminalStatus,
  RepositoryResolutionError,
} from "../lib/boardSource.ts";
import { loadConfig, type ResolvedConfig } from "../lib/config.ts";
import { getUsageByModel, type UsageByModel } from "../lib/usage.ts";
import {
  clearOutput,
  errorMessage,
  getLinearClient,
  log,
  sleep,
  writeOutput,
} from "../lib/util.ts";
import { worktrees } from "../lib/worktrees.ts";
import { type Cleaner, createCleaner } from "./cleaner.ts";
import { createDispatcher, type Dispatcher } from "./dispatcher.ts";

const RATE_LIMIT_DELAY_MS = 60_000;
const RETRY_BASE_DELAY_MS = 1000;
const RETRY_MAX_ATTEMPTS = 3;
const STATUS_CARD_TITLE_WIDTH = 42;
const STATUS_CARD_ID_WIDTH = 8;
const HEADER_BAR_WIDTH = 70;
const SECTION_BAR_WIDTH = 50;
const MS_PER_SECOND = 1000;

const STATUS_ICON_DEFAULT = "  ";

function statusIconFor(status: string, config: ResolvedConfig): string {
  if (status === config.linear.statuses.inProgress) {
    return ">>";
  }
  if (status === config.linear.statuses.todo) {
    return "--";
  }
  if (isTerminalStatus(status, config)) {
    return "ok";
  }
  return STATUS_ICON_DEFAULT;
}

async function withRetry<T>(
  function_: () => Promise<T>,
  signal?: AbortSignal,
  maxRetries = RETRY_MAX_ATTEMPTS,
  baseDelayMs = RETRY_BASE_DELAY_MS,
): Promise<T> {
  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    try {
      // oxlint-disable-next-line no-await-in-loop -- retry loop sequences attempts deliberately
      return await function_();
    } catch (error) {
      if (error instanceof RepositoryResolutionError) {
        throw error;
      }
      if (attempt === maxRetries) {
        throw error;
      }
      const message = errorMessage(error);
      const isRateLimit = message.includes("Rate limit");
      const delay = isRateLimit ? RATE_LIMIT_DELAY_MS : baseDelayMs * 2 ** attempt;
      log(`Retrying in ${delay / MS_PER_SECOND}s (attempt ${attempt + 1}/${maxRetries})...`);
      // oxlint-disable-next-line no-await-in-loop -- backoff is intentionally sequential
      await sleep(delay, signal);
      if (signal?.aborted === true) {
        throw new WatchLoopShutdownError();
      }
    }
  }
  /* v8 ignore next @preserve -- the for-loop above always returns or throws */
  throw new Error("unreachable");
}

class WatchLoopShutdownError extends Error {
  public constructor() {
    super("watch loop shutdown requested");
    this.name = "WatchLoopShutdownError";
  }
}

function groupByStatus(issues: Issue[], knownOrder: string[]): Map<string, Issue[]> {
  const groups = new Map<string, Issue[]>();
  for (const status of knownOrder) {
    groups.set(status, []);
  }
  for (const issue of issues) {
    /* v8 ignore next @preserve -- knownOrder seeds an entry for each issue.status returned by buildStatusOrder */
    const group = groups.get(issue.status) ?? [];
    group.push(issue);
    groups.set(issue.status, group);
  }
  return groups;
}

function buildStatusOrder(state: BoardState, config: ResolvedConfig): string[] {
  const head = [
    ...new Set([
      config.linear.statuses.inProgress,
      config.linear.statuses.todo,
      config.linear.statuses.done,
      ...config.linear.statuses.terminal,
    ]),
  ];
  const seen = new Set(head);
  const tail: string[] = [];
  for (const issue of state.issues) {
    if (!seen.has(issue.status)) {
      seen.add(issue.status);
      tail.push(issue.status);
    }
  }
  return [...head, ...tail];
}

function render(state: BoardState, config: ResolvedConfig, previous?: BoardState): void {
  const order = buildStatusOrder(state, config);
  const grouped = groupByStatus(state.issues, order);
  const previousGrouped = previous ? groupByStatus(previous.issues, order) : undefined;
  const previousById = previous
    ? new Map(previous.issues.map((issue) => [issue.id, issue]))
    : undefined;

  clearOutput();
  writeOutput(
    `groundcrew — ${config.linear.projectSlug} — ${new Date(state.timestamp).toLocaleTimeString()}`,
  );
  writeOutput(`Max in progress: ${config.orchestrator.maximumInProgress}`);
  writeOutput("=".repeat(HEADER_BAR_WIDTH));
  writeOutput();

  for (const [status, issues] of grouped) {
    if (issues.length === 0) {
      continue;
    }

    const previousCount = previousGrouped?.get(status)?.length ?? issues.length;
    const delta =
      issues.length === previousCount
        ? ""
        : ` (${issues.length > previousCount ? "+" : ""}${issues.length - previousCount})`;

    writeOutput(`${statusIconFor(status, config)} ${status} (${issues.length})${delta}`);
    writeOutput("-".repeat(SECTION_BAR_WIDTH));

    for (const issue of issues) {
      const previousIssue = previousById?.get(issue.id);
      const changed =
        previousIssue && previousIssue.status !== issue.status
          ? ` [was: ${previousIssue.status}]`
          : "";
      writeOutput(
        `   ${issue.id.padEnd(STATUS_CARD_ID_WIDTH)}  ${issue.title.slice(0, STATUS_CARD_TITLE_WIDTH).padEnd(STATUS_CARD_TITLE_WIDTH)}  ${issue.assignee}${changed}`,
      );
    }
    writeOutput();
  }

  const total = state.issues.length;
  const done = state.issues.filter((issue) => isTerminalStatus(issue.status, config)).length;
  /* v8 ignore next @preserve -- grouped has all known statuses pre-seeded by groupByStatus */
  const active = grouped.get(config.linear.statuses.inProgress)?.length ?? 0;
  writeOutput(
    `Total: ${total} | Active: ${active}/${config.orchestrator.maximumInProgress} | Done: ${done} | Remaining: ${total - done}`,
  );
}

export interface OrchestratorOptions {
  watch: boolean;
  dryRun: boolean;
}

async function fetchUsageOrEmpty(
  config: ResolvedConfig,
  signal?: AbortSignal,
): Promise<UsageByModel> {
  try {
    return await getUsageByModel(config, signal);
  } catch (error) {
    if (signal?.aborted === true) {
      throw error;
    }
    log(`Usage check failed, proceeding without limits: ${errorMessage(error)}`);
    return {};
  }
}

export async function orchestrate(options: OrchestratorOptions): Promise<void> {
  const config = await loadConfig();
  const client = getLinearClient();

  const boardSource: BoardSource = createBoardSource({ config, client });
  await boardSource.verify();

  const cleaner: Cleaner = createCleaner({ config });
  const dispatcher: Dispatcher = createDispatcher({ config, client });
  let previous: BoardState | undefined;

  const tick = async (signal?: AbortSignal): Promise<void> => {
    const state = await withRetry(async () => await boardSource.fetch(), signal);
    render(state, config, previous);
    const worktreeEntries = worktrees.list(config);
    const tickArguments = {
      state,
      worktreeEntries,
      dryRun: options.dryRun,
      ...(signal === undefined ? {} : { signal }),
    };
    await cleaner.runOnce(tickArguments);
    await dispatcher.runOnce({
      ...tickArguments,
      // Lazy: dispatcher only invokes this after its own early-returns, so
      // an idle board doesn't burn a codexbar shell-out per tick.
      usage: async (usageSignal) => await fetchUsageOrEmpty(config, usageSignal),
    });
    previous = state;
  };

  await (options.watch ? runWatchLoop(tick, config) : tick());
}

const SHUTDOWN_EXIT_CODE = 130;
const SHUTDOWN_FORCE_EXIT_DELAY_MS = 10_000;
type ShutdownSignal = "SIGINT" | "SIGTERM";
const SHUTDOWN_EXIT_CODES = {
  SIGINT: SHUTDOWN_EXIT_CODE,
  SIGTERM: 143,
} satisfies Record<ShutdownSignal, number>;

function signalExitCode(signal: ShutdownSignal): number {
  return SHUTDOWN_EXIT_CODES[signal];
}

async function runWatchLoop(
  tick: (signal: AbortSignal) => Promise<void>,
  config: ResolvedConfig,
): Promise<void> {
  const shutdown = new AbortController();
  let forceExitTimer: NodeJS.Timeout | undefined;
  const forceExit = (signal: ShutdownSignal): never => {
    log(`${signal} shutdown did not finish; forcing exit`);
    // oxlint-disable-next-line node/no-process-exit -- shutdown escape hatch for non-abortable hangs
    process.exit(signalExitCode(signal));
  };
  // First signal asks the loop to drain after the current tick. A second
  // signal escalates immediately. The timer covers non-abortable work that
  // never returns from the current tick.
  const requestShutdown = (signal: ShutdownSignal): void => {
    if (shutdown.signal.aborted) {
      log(`${signal} received again — forcing exit`);
      forceExit(signal);
    }
    log(
      `Shutdown requested (${signal}); finishing current tick then exiting. Press again to force.`,
    );
    shutdown.abort();
    forceExitTimer = setTimeout(() => {
      forceExit(signal);
    }, SHUTDOWN_FORCE_EXIT_DELAY_MS);
  };
  const handleSigint = (): void => {
    requestShutdown("SIGINT");
  };
  const handleSigterm = (): void => {
    requestShutdown("SIGTERM");
  };
  process.on("SIGINT", handleSigint);
  process.on("SIGTERM", handleSigterm);
  try {
    while (!shutdown.signal.aborted) {
      try {
        // oxlint-disable-next-line no-await-in-loop -- watch loop ticks sequentially with a delay between
        await tick(shutdown.signal);
      } catch (error) {
        if (error instanceof WatchLoopShutdownError) {
          break;
        }
        if (error instanceof RepositoryResolutionError) {
          throw error;
        }
        const message = errorMessage(error);
        if (message.includes("Signal: SIGINT")) {
          if (!shutdown.signal.aborted) {
            requestShutdown("SIGINT");
          }
          break;
        }
        log(`Error: ${message}`);
      }
      if (shutdown.signal.aborted) {
        break;
      }
      log(`Next poll in ${config.orchestrator.pollIntervalMilliseconds / MS_PER_SECOND}s...`);
      // oxlint-disable-next-line no-await-in-loop -- watch loop is intentionally serial
      await sleep(config.orchestrator.pollIntervalMilliseconds, shutdown.signal);
    }
  } finally {
    if (forceExitTimer !== undefined) {
      clearTimeout(forceExitTimer);
    }
    process.off("SIGINT", handleSigint);
    process.off("SIGTERM", handleSigterm);
  }
}
