import type { TeardownResult } from "../lib/worktrees.js";

export function emptyTeardownResult(overrides: Partial<TeardownResult> = {}): TeardownResult {
  return {
    closed: [],
    removed: [],
    failures: [],
    workspaceProbe: { kind: "ok", names: new Set<string>() },
    ...overrides,
  };
}
