import { resolve, sep } from "node:path";

import { runCommandAsync } from "./commandRunner.ts";

export function sandboxNameFor(arguments_: { repository: string; model: string }): string {
  const raw = `groundcrew-${arguments_.repository}-${arguments_.model}`.toLowerCase();
  const normalized = raw
    .replaceAll(/[^a-z0-9.+-]+/g, "-")
    .replaceAll(/-+/g, "-")
    .replaceAll(/^-|-$/g, "");
  return normalized;
}

export function sandboxWorktreeDirFor(arguments_: {
  repoDir: string;
  sandboxName: string;
  branchName: string;
}): string {
  const worktreesRoot = resolve(arguments_.repoDir, ".sbx", `${arguments_.sandboxName}-worktrees`);
  const candidate = resolve(worktreesRoot, arguments_.branchName);
  if (!candidate.startsWith(`${worktreesRoot}${sep}`)) {
    throw new Error(`Invalid branchName for sandbox worktree path: ${arguments_.branchName}`);
  }
  return candidate;
}

export async function sandboxExists(sandboxName: string, signal?: AbortSignal): Promise<boolean> {
  const out =
    signal === undefined
      ? await runCommandAsync("sbx", ["ls"])
      : await runCommandAsync("sbx", ["ls"], { signal });
  return out.split("\n").some((line) => line.trim().split(/\s+/)[0] === sandboxName);
}
