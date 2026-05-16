import type { TeardownResult, WorktreeEntry } from "../lib/worktrees.ts";
import { captureConsoleLog, type ConsoleCapture } from "../testHelpers/consoleCapture.ts";
import { emptyTeardownResult } from "../testHelpers/teardownResult.ts";
import { logTeardown, recordTeardownEvents } from "./teardownReporter.ts";

function hostEntry(ticket: string): WorktreeEntry {
  return {
    repository: "repo-a",
    ticket,
    branchName: `rocky-${ticket}`,
    dir: `/work/repo-a-${ticket}`,
    kind: "host",
  };
}

function spriteEntry(ticket: string): WorktreeEntry {
  return {
    repository: "repo-a",
    ticket,
    branchName: `rocky-${ticket}`,
    dir: `/home/sprite/groundcrew/worktrees/repo-a-${ticket}`,
    kind: "sprite",
    spriteName: "crew-claude-1",
    remoteRepoDir: "/home/sprite/dev/repo-a",
  };
}

describe(logTeardown, () => {
  let consoleLog: ConsoleCapture;

  beforeEach(() => {
    consoleLog = captureConsoleLog();
  });

  afterEach(() => {
    consoleLog.restore();
  });

  it("emits nothing when the result is empty and the probe was clean", () => {
    logTeardown(emptyTeardownResult());

    expect(consoleLog.output()).toBe("");
  });

  it("logs `workspace list failed: ...` when the probe is unavailable and an error was captured", () => {
    const result: TeardownResult = emptyTeardownResult({
      workspaceProbe: { kind: "unavailable", error: new Error("cmux exploded") },
    });

    logTeardown(result);

    expect(consoleLog.output()).toContain("workspace list failed: cmux exploded");
  });

  it("stays silent on probe.unavailable when no underlying error was captured", () => {
    logTeardown(emptyTeardownResult({ workspaceProbe: { kind: "unavailable" } }));

    expect(consoleLog.output()).not.toContain("workspace list failed");
  });

  it("logs `Closed workspace <ticket>` for each ticket the result reports closed", () => {
    logTeardown(emptyTeardownResult({ closed: ["team-1", "team-2"] }));

    const out = consoleLog.output();
    expect(out).toContain("Closed workspace team-1");
    expect(out).toContain("Closed workspace team-2");
  });

  it("logs `Cleanup complete` and `Worktree: <dir> (removed)` for each removed entry", () => {
    logTeardown(emptyTeardownResult({ removed: [hostEntry("team-1"), spriteEntry("team-2")] }));

    const out = consoleLog.output();
    expect(out).toContain("Cleanup complete for team-1 (host)");
    expect(out).toContain("/work/repo-a-team-1 (removed)");
    expect(out).toContain("Cleanup complete for team-2 (sprite)");
    expect(out).toContain("/home/sprite/groundcrew/worktrees/repo-a-team-2 (removed)");
  });

  it("logs workspace_close failures with the standard wording", () => {
    logTeardown(
      emptyTeardownResult({
        failures: [
          { entry: hostEntry("team-1"), step: "workspace_close", error: new Error("cmux down") },
        ],
      }),
    );

    expect(consoleLog.output()).toContain("workspace close failed for team-1: cmux down");
  });

  it("logs worktree_remove failures with the standard wording", () => {
    logTeardown(
      emptyTeardownResult({
        failures: [
          { entry: hostEntry("team-1"), step: "worktree_remove", error: new Error("busy") },
        ],
      }),
    );

    expect(consoleLog.output()).toContain("Cleanup failed for team-1 (host): busy");
  });
});

describe(recordTeardownEvents, () => {
  let consoleLog: ConsoleCapture;

  beforeEach(() => {
    consoleLog = captureConsoleLog();
  });

  afterEach(() => {
    consoleLog.restore();
  });

  it("emits nothing when the result is empty and the probe was clean", () => {
    recordTeardownEvents(emptyTeardownResult());

    expect(consoleLog.output()).toBe("");
  });

  it("emits workspace_list_failed when the probe is unavailable", () => {
    recordTeardownEvents(emptyTeardownResult({ workspaceProbe: { kind: "unavailable" } }));

    expect(consoleLog.output()).toContain(
      "event=cleanup outcome=failed reason=workspace_list_failed",
    );
  });

  it("includes the underlying error in workspace_list_failed when one was captured", () => {
    recordTeardownEvents(
      emptyTeardownResult({
        workspaceProbe: { kind: "unavailable", error: new Error("cmux exploded") },
      }),
    );

    const out = consoleLog.output();
    expect(out).toContain("event=cleanup outcome=failed reason=workspace_list_failed");
    expect(out).toContain("cmux exploded");
  });

  it("emits workspace_closed events for each closed ticket", () => {
    recordTeardownEvents(emptyTeardownResult({ closed: ["team-1", "team-2"] }));

    const out = consoleLog.output();
    expect(out).toContain("event=cleanup outcome=workspace_closed ticket=team-1");
    expect(out).toContain("event=cleanup outcome=workspace_closed ticket=team-2");
  });

  it("emits cleaned events for each removed entry with repository and kind", () => {
    recordTeardownEvents(
      emptyTeardownResult({ removed: [hostEntry("team-1"), spriteEntry("team-2")] }),
    );

    const out = consoleLog.output();
    expect(out).toContain(
      "event=cleanup outcome=cleaned ticket=team-1 repository=repo-a kind=host",
    );
    expect(out).toContain(
      "event=cleanup outcome=cleaned ticket=team-2 repository=repo-a kind=sprite",
    );
  });

  it("emits workspace_close_failed for workspace_close failures", () => {
    recordTeardownEvents(
      emptyTeardownResult({
        failures: [
          { entry: hostEntry("team-1"), step: "workspace_close", error: new Error("close down") },
        ],
      }),
    );

    const out = consoleLog.output();
    expect(out).toContain("event=cleanup outcome=failed reason=workspace_close_failed");
    expect(out).toContain("ticket=team-1");
    expect(out).toContain("close down");
  });

  it("emits failed events for worktree_remove failures with repository and kind", () => {
    recordTeardownEvents(
      emptyTeardownResult({
        failures: [
          { entry: hostEntry("team-1"), step: "worktree_remove", error: new Error("busy") },
        ],
      }),
    );

    const out = consoleLog.output();
    expect(out).toContain("event=cleanup outcome=failed");
    expect(out).toContain("ticket=team-1");
    expect(out).toContain("repository=repo-a");
    expect(out).toContain("kind=host");
    expect(out).toContain("busy");
  });
});
