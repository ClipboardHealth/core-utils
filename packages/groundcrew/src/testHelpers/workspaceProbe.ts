import type { WorkspaceProbe } from "../lib/workspaces.ts";

export function probeError(probe: WorkspaceProbe): unknown {
  return probe.kind === "unavailable" ? probe.error : undefined;
}
