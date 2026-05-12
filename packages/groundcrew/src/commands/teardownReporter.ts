import { errorMessage, log, logEvent } from "../lib/util.js";
import type { TeardownResult } from "../lib/worktrees.js";

export function logTeardown(result: TeardownResult): void {
  if (result.workspaceProbe.kind === "unavailable" && result.workspaceProbe.error !== undefined) {
    log(`workspace list failed: ${errorMessage(result.workspaceProbe.error)}`);
  }
  for (const ticket of result.closed) {
    log(`Closed workspace ${ticket}`);
  }
  for (const entry of result.removed) {
    log(`Cleanup complete for ${entry.ticket} (${entry.kind})`);
    log(`  Worktree: ${entry.dir} (removed)`);
  }
  for (const failure of result.failures) {
    const message = errorMessage(failure.error);
    if (failure.step === "workspace_close") {
      log(`workspace close failed for ${failure.entry.ticket}: ${message}`);
    } else {
      log(`Cleanup failed for ${failure.entry.ticket} (${failure.entry.kind}): ${message}`);
    }
  }
}

export function recordTeardownEvents(result: TeardownResult): void {
  if (result.workspaceProbe.kind === "unavailable") {
    logEvent("cleanup", {
      outcome: "failed",
      reason: "workspace_list_failed",
      ...(result.workspaceProbe.error === undefined
        ? {}
        : { error: errorMessage(result.workspaceProbe.error) }),
    });
  }
  for (const ticket of result.closed) {
    logEvent("cleanup", { outcome: "workspace_closed", ticket });
  }
  for (const entry of result.removed) {
    logEvent("cleanup", {
      outcome: "cleaned",
      ticket: entry.ticket,
      repository: entry.repository,
      kind: entry.kind,
    });
  }
  for (const failure of result.failures) {
    const message = errorMessage(failure.error);
    if (failure.step === "workspace_close") {
      logEvent("cleanup", {
        outcome: "failed",
        reason: "workspace_close_failed",
        ticket: failure.entry.ticket,
        error: message,
      });
    } else {
      logEvent("cleanup", {
        outcome: "failed",
        ticket: failure.entry.ticket,
        repository: failure.entry.repository,
        kind: failure.entry.kind,
        error: message,
      });
    }
  }
}
