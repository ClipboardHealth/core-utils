import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

import { isPlainObject } from "./json";

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
  try {
    return git({ args: ["merge-base", base, "HEAD"], cwd }).trim();
  } catch (error) {
    throw new Error(
      `Cannot find the merge base of ${base} and HEAD: ${error instanceof Error ? error.message : String(error)}\nIn GitHub Actions, check out with \`fetch-depth: 0\` so the base commit and its history are present.`,
      { cause: error },
    );
  }
}

/**
 * Compares the working tree, including uncommitted and untracked files, with `mergeBase`, and
 * returns the changed lines of files whose path matches `include`.
 */
export function readChangedLines(params: {
  cwd: string;
  include: RegExp;
  mergeBase: string;
}): ChangedLines {
  const { cwd, include, mergeBase } = params;
  const changed: ChangedLines = new Map();
  // Fixed prefixes and unquoted paths, whatever the user's diff configuration.
  const diff = git({
    args: [
      "-c",
      "core.quotePath=false",
      "diff",
      "--unified=0",
      "--no-color",
      "--no-ext-diff",
      "--src-prefix=a/",
      "--dst-prefix=b/",
      "--find-renames",
      "--diff-filter=AMR",
      mergeBase,
    ],
    cwd,
  });

  let lines: Set<number> | undefined;
  let previous = "";
  for (const line of diff.split("\n")) {
    // A `+++` line is a file header only right after `---`; elsewhere it is an added line.
    if (previous.startsWith("--- ") && line.startsWith("+++ b/")) {
      // Git ends a path that contains a space with a tab.
      const file = line.slice("+++ b/".length).replace(/\t$/, "");
      lines = include.test(file) ? getOrCreate({ changed, file }) : undefined;
    } else {
      const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/.exec(line);
      if (hunk && lines) {
        const start = Number(hunk[1]);
        const count = hunk[2] === undefined ? 1 : Number(hunk[2]);
        for (let offset = 0; offset < count; offset += 1) {
          lines.add(start + offset);
        }
      }
    }

    previous = line;
  }

  const untracked = git({ args: ["ls-files", "--others", "--exclude-standard", "-z"], cwd })
    .split("\0")
    .filter((file) => include.test(file));
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

  const event: unknown = JSON.parse(readFileSync(params.eventPath, "utf8"));
  const pullRequest = isPlainObject(event) ? event["pull_request"] : undefined;
  const base = isPlainObject(pullRequest) ? pullRequest["base"] : undefined;
  const sha = isPlainObject(base) ? base["sha"] : undefined;
  return typeof sha === "string" ? sha : undefined;
}

function resolveDefaultBranch(params: { cwd: string }): string {
  try {
    return git({ args: ["rev-parse", "--abbrev-ref", "origin/HEAD"], cwd: params.cwd }).trim();
  } catch {
    return "origin/main";
  }
}
