/**
 * `crew setup repos` — clone every entry of `workspace.knownRepositories`
 * that does not already exist under `workspace.projectDir`. Entries
 * shaped `<owner>/<repo>` are cloned via `gh repo clone`; bare-name
 * entries are skipped with a hint, because they have no canonical URL
 * we can guess at without involving the user's gh login. Idempotent.
 */

import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { runCommandAsync } from "../lib/commandRunner.ts";
import { loadConfig, type ResolvedConfig } from "../lib/config.ts";
import { which } from "../lib/host.ts";
import { errorMessage, log, writeOutput } from "../lib/util.ts";

export interface SetupReposOptions {
  /** Print the plan without running any clone. */
  dryRun?: boolean;
  /**
   * Restrict the action to this subset of `knownRepositories`. Each entry
   * must match an entry in the config or the call rejects before any side
   * effect.
   */
  only?: readonly string[];
}

export interface SetupReposResult {
  /** Entries already present under `projectDir`. */
  existing: string[];
  /** Entries that would be cloned in dry-run mode. */
  planned: string[];
  /** Entries successfully cloned this run. */
  cloned: string[];
  /** Entries skipped with a reason (e.g. bare names, dry-run). */
  skipped: { repo: string; reason: string }[];
  /** Entries that failed during clone. */
  failed: { repo: string; error: Error }[];
  /** True when `gh` is missing and at least one clone was needed. */
  ghMissing: boolean;
}

interface ClonePlan {
  toClone: string[];
  existing: string[];
  skipped: { repo: string; reason: string }[];
}

function emptyResult(): SetupReposResult {
  return {
    existing: [],
    planned: [],
    cloned: [],
    skipped: [],
    failed: [],
    ghMissing: false,
  };
}

function selectRepositories(
  config: ResolvedConfig,
  only: readonly string[] | undefined,
): readonly string[] {
  if (only === undefined) {
    return config.workspace.knownRepositories;
  }
  const known = new Set(config.workspace.knownRepositories);
  const unknown = only.filter((entry) => !known.has(entry));
  if (unknown.length > 0) {
    throw new Error(
      `Repositories not in workspace.knownRepositories: ${unknown.join(", ")}. Known: ${config.workspace.knownRepositories.join(", ")}`,
    );
  }
  return only;
}

function planClones(config: ResolvedConfig, repositories: readonly string[]): ClonePlan {
  const projectDir = resolve(config.workspace.projectDir);
  const toClone: string[] = [];
  const existing: string[] = [];
  const skipped: { repo: string; reason: string }[] = [];

  for (const entry of repositories) {
    const target = resolve(projectDir, entry);
    if (existsSync(target)) {
      existing.push(entry);
      continue;
    }
    if (!entry.includes("/")) {
      skipped.push({
        repo: entry,
        reason: `bare name needs owner/ prefix to auto-clone; clone manually into ${target}`,
      });
      continue;
    }
    toClone.push(entry);
  }

  return { toClone, existing, skipped };
}

export async function setupRepos(
  config: ResolvedConfig,
  options: SetupReposOptions,
): Promise<SetupReposResult> {
  const repositories = selectRepositories(config, options.only);
  const plan = planClones(config, repositories);
  const result = emptyResult();
  result.existing = plan.existing;
  result.skipped = plan.skipped;

  for (const entry of plan.existing) {
    log(`[exists] ${entry}`);
  }
  for (const { repo, reason } of plan.skipped) {
    log(`[skip] ${repo} — ${reason}`);
  }

  if (options.dryRun === true) {
    result.planned = plan.toClone;
    for (const entry of plan.toClone) {
      log(`[dry-run] would clone ${entry}`);
    }
    return result;
  }

  if (plan.toClone.length === 0) {
    return result;
  }

  const ghPath = await which("gh");
  if (ghPath === undefined) {
    result.ghMissing = true;
    writeOutput(
      "gh CLI not found — install with 'brew install gh' (or clone the missing repos manually).",
    );
    for (const entry of plan.toClone) {
      result.skipped.push({ repo: entry, reason: "gh CLI not installed" });
    }
    return result;
  }

  const projectDir = resolve(config.workspace.projectDir);
  // Sequential on purpose: each `gh repo clone` inherits stdio for progress
  // bars and auth prompts. Parallel clones would interleave output and make
  // any interactive 2FA prompt unanswerable.
  for (const entry of plan.toClone) {
    const target = resolve(projectDir, entry);
    log(`[clone] ${entry} → ${target}`);
    try {
      // oxlint-disable-next-line no-await-in-loop -- see comment above
      await runCommandAsync("gh", ["repo", "clone", entry, target], {
        stdio: "inherit",
        timeoutMs: 0,
      });
      result.cloned.push(entry);
    } catch (error) {
      const wrapped = error instanceof Error ? error : new Error(errorMessage(error));
      log(`[fail]  ${entry}: ${wrapped.message}`);
      result.failed.push({ repo: entry, error: wrapped });
    }
  }

  return result;
}

function parseArguments(argv: string[]): SetupReposOptions {
  let dryRun = false;
  const positionals: string[] = [];
  for (const argument of argv) {
    if (argument === "--dry-run") {
      dryRun = true;
      continue;
    }
    if (argument.startsWith("-")) {
      throw new Error(
        `Unknown option: ${argument}\nUsage: crew setup repos [--dry-run] [<repo>...]`,
      );
    }
    positionals.push(argument);
  }
  const options: SetupReposOptions = { dryRun };
  if (positionals.length > 0) {
    options.only = positionals;
  }
  return options;
}

export async function setupReposCli(argv: string[]): Promise<void> {
  const options = parseArguments(argv);
  const config = await loadConfig();
  const result = await setupRepos(config, options);

  if (result.ghMissing || result.failed.length > 0) {
    process.exitCode = 1;
    return;
  }
  // Bare-name skips mean setup is incomplete — signal that to CI gates.
  const bareSkips = result.skipped.filter(({ reason }) => reason.includes("bare name"));
  if (bareSkips.length > 0) {
    process.exitCode = 1;
  }
}
