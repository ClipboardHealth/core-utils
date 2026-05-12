import { resolve } from "node:path";

import { runCommandAsync } from "./commandRunner.js";

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
  return resolve(
    arguments_.repoDir,
    ".sbx",
    `${arguments_.sandboxName}-worktrees`,
    arguments_.branchName,
  );
}

export async function sandboxExists(sandboxName: string, signal?: AbortSignal): Promise<boolean> {
  const out =
    signal === undefined
      ? await runCommandAsync("sbx", ["ls"])
      : await runCommandAsync("sbx", ["ls"], { signal });
  return out.split("\n").some((line) => line.trim().split(/\s+/)[0] === sandboxName);
}
