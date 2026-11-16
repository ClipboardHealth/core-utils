import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

/** Line numbers (1-based) that are new or changed in each file, keyed by repository-relative path. */
export type ChangedLines = Map<string, Set<number>>;

export function git(params: { args: readonly string[]; cwd: string }): string {
  return execFileSync("git", params.args, {
    cwd: params.cwd,
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
  });
}

/**
 * Resolves the commit to compare against: `base` when given, else the pull request base from
 * GitHub Actions, else the remote default branch. Returns its merge base with HEAD.
 */
export function resolveMergeBase(params: {
  base: string | undefined;
  cwd: string;
  eventPath: string | undefined;
}): string {
  const { cwd, eventPath } = params;
  const base = params.base ?? readPullRequestBase({ eventPath }) ?? resolveDefaultBranch({ cwd });
  return git({ args: ["merge-base", base, "HEAD"], cwd }).trim();
}

/** Compares the working tree, including uncommitted and untracked files, with `mergeBase`. */
export function readChangedLines(params: { cwd: string; mergeBase: string }): ChangedLines {
  const { cwd, mergeBase } = params;
  const changed: ChangedLines = new Map();
  const diff = git({
    args: [
      "diff",
      "--unified=0",
      "--no-color",
      "--no-ext-diff",
      "--find-renames",
      "--diff-filter=AMR",
      mergeBase,
    ],
    cwd,
  });

  let lines: Set<number> | undefined;
  for (const line of diff.split("\n")) {
    if (line.startsWith("+++ ")) {
      const file = line === "+++ /dev/null" ? undefined : line.slice("+++ b/".length);
      lines = file === undefined ? undefined : getOrCreate({ changed, file });
      continue;
    }

    const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/.exec(line);
    if (hunk && lines) {
      const start = Number(hunk[1]);
      const count = hunk[2] === undefined ? 1 : Number(hunk[2]);
      for (let offset = 0; offset < count; offset += 1) {
        lines.add(start + offset);
      }
    }
  }

  const untracked = git({ args: ["ls-files", "--others", "--exclude-standard", "-z"], cwd })
    .split("\0")
    .filter((file) => file !== "");
  for (const file of untracked) {
    const lineCount = readFileSync(`${cwd}/${file}`, "utf8").split("\n").length;
    const fileLines = getOrCreate({ changed, file });
    for (let line = 1; line <= lineCount; line += 1) {
      fileLines.add(line);
    }
  }

  return changed;
}

function getOrCreate(params: { changed: ChangedLines; file: string }): Set<number> {
  const { changed, file } = params;
  const existing = changed.get(file);
  if (existing) {
    return existing;
  }

  const created = new Set<number>();
  changed.set(file, created);
  return created;
}

function readPullRequestBase(params: { eventPath: string | undefined }): string | undefined {
  if (params.eventPath === undefined || params.eventPath === "") {
    return undefined;
  }

  const event = JSON.parse(readFileSync(params.eventPath, "utf8")) as {
    pull_request?: { base?: { sha?: string } };
  };
  return event.pull_request?.base?.sha;
}

function resolveDefaultBranch(params: { cwd: string }): string {
  try {
    return git({
      args: ["rev-parse", "--abbrev-ref", "origin/HEAD"],
      cwd: params.cwd,
    }).trim();
  } catch {
    return "origin/main";
  }
}
