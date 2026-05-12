import type { WorkspaceProbe } from "../lib/workspaces.js";

export function probeError(probe: WorkspaceProbe): unknown {
  return probe.kind === "unavailable" ? probe.error : undefined;
}
