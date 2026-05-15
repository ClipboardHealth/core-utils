/**
 * Worktree lifecycle — manages git worktrees for tickets across two kinds:
 *
 * - **Host worktree** — a `git worktree add`'d sibling at
 *   `<projectDir>/<repo>-<TICKET>/`.
 * - **Sandbox worktree** — an `sbx run --branch` worktree inside the
 *   persistent Docker Sandboxes container at
 *   `<repoDir>/.sbx/<sandboxName>-worktrees/<branchName>/`.
 *
 * Each kind has its own adapter (`hostWorktreeAdapter`,
 * `sandboxWorktreeAdapter`). Callers go through the `worktrees` namespace
 * and never branch on kind themselves — the dispatchers below pick the
 * adapter by `spec.strategy` (for `create`) or `entry.kind` (for `remove`),
 * mirroring the `workspaces` module's adapter pattern.
 */

import {
  type Dirent,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { homedir, userInfo } from "node:os";
import { dirname, resolve } from "node:path";

import { runCommandAsync, type RunCommandOptions } from "./commandRunner.ts";
import type { ResolvedConfig, WorkspaceRunner } from "./config.ts";
import type { ResolvedIsolationStrategy } from "./isolation.ts";
import { shellSingleQuote } from "./launchCommand.ts";
import { sandboxExists, sandboxNameFor, sandboxWorktreeDirFor } from "./sandbox.ts";
import { errorMessage, log, readEnvironmentVariable } from "./util.ts";
import { type WorkspaceProbe, workspaces } from "./workspaces.ts";

const LONG_RUNNING_COMMAND_OPTIONS = { stdio: "inherit", timeoutMs: 0 } as const;

export type WorktreeKind = "host" | "sandbox" | "sprite";

export interface WorktreeEntry {
  repository: string;
  /** Linear ticket id, lowercased — e.g. "team-220". */
  ticket: string;
  /** Lowercase, slash-free `<user>-<ticket>`. */
  branchName: string;
  dir: string;
  kind: WorktreeKind;
  /** Set iff `kind === "sandbox"`. */
  sandboxName?: string;
  /** Set iff `kind === "sprite"`. */
  spriteName?: string;
  /** Set iff `kind === "sprite"`. */
  remoteRepoDir?: string;
}

export interface WorktreeSpec {
  repository: string;
  ticket: string;
  model: string;
  strategy: ResolvedIsolationStrategy;
  runner?: WorkspaceRunner;
}

const TICKET_RE = /^[a-z][\da-z]*-\d+$/;
const TICKET_DIR_RE = /^(.+)-([a-z][\da-z]*-\d+)$/;
const BRANCH_TICKET_RE = /([a-z][\da-z]*-\d+)$/;

function branchPrefix(): string {
  const name = userInfo().username;
  if (name.length === 0) {
    throw new Error("Could not determine OS username for the branch prefix.");
  }
  return name;
}

export function branchNameForTicket(ticket: string): string {
  return `${branchPrefix()}-${ticket}`;
}

function ticketFromBranchDir(name: string): string | undefined {
  return BRANCH_TICKET_RE.exec(name)?.[1];
}

export function repoDirFor(config: ResolvedConfig, repository: string): string {
  if (!config.workspace.knownRepositories.includes(repository)) {
    throw new Error(
      `Repository "${repository}" is not in workspace.knownRepositories: ${config.workspace.knownRepositories.join(", ")}`,
    );
  }
  const repoDir = resolve(config.workspace.projectDir, repository);
  if (!existsSync(repoDir)) {
    throw new Error(`Repository not found: ${repoDir}`);
  }
  return repoDir;
}

interface BasePaths {
  projectDir: string;
  repoDir: string;
  ticket: string;
  branchName: string;
  hostWorktreeDir: string;
  hostWorktreeName: string;
}

function basePaths(config: ResolvedConfig, repository: string, ticket: string): BasePaths {
  // Tickets must match the same shape the worktree discovery regexes use,
  // so create()/list()/findByTicket() agree on what's a valid worktree.
  // This also rejects traversal tokens before they reach resolve().
  if (!TICKET_RE.test(ticket)) {
    throw new Error(`Invalid ticket "${ticket}": must be a plain ticket id`);
  }

  const projectDir = resolve(config.workspace.projectDir);
  const repoDir = repoDirFor(config, repository);
  const hostWorktreeName = `${repository}-${ticket}`;
  const hostWorktreeDir = resolve(projectDir, hostWorktreeName);

  return {
    projectDir,
    repoDir,
    ticket,
    branchName: branchNameForTicket(ticket),
    hostWorktreeDir,
    hostWorktreeName,
  };
}

interface WorktreeAdapter {
  create(config: ResolvedConfig, spec: WorktreeSpec, signal?: AbortSignal): Promise<WorktreeEntry>;
  list(config: ResolvedConfig): WorktreeEntry[];
  remove(
    config: ResolvedConfig,
    entry: WorktreeEntry,
    options: { force: boolean; signal?: AbortSignal },
  ): Promise<void>;
}

function signalProperty(signal?: AbortSignal): { signal: AbortSignal } | Record<never, never> {
  return signal === undefined ? {} : { signal };
}

function longRunningCommandOptions(signal?: AbortSignal): RunCommandOptions & { stdio: "inherit" } {
  return signal === undefined
    ? LONG_RUNNING_COMMAND_OPTIONS
    : { ...LONG_RUNNING_COMMAND_OPTIONS, signal };
}

async function deleteBranchBestEffort(arguments_: {
  cmd: string;
  cmdArgs: readonly string[];
  branchName: string;
  signal?: AbortSignal;
}): Promise<void> {
  try {
    await (arguments_.signal === undefined
      ? runCommandAsync(arguments_.cmd, arguments_.cmdArgs)
      : runCommandAsync(arguments_.cmd, arguments_.cmdArgs, { signal: arguments_.signal }));
    log(`Deleted branch ${arguments_.branchName}`);
  } catch (error) {
    if (arguments_.signal?.aborted === true) {
      throw error;
    }
    log(`Branch ${arguments_.branchName} cleanup skipped: ${errorMessage(error)}`);
  }
}

const hostWorktreeAdapter: WorktreeAdapter = {
  async create(config, spec, signal) {
    const base = basePaths(config, spec.repository, spec.ticket);
    const baseRef = `${config.git.remote}/${config.git.defaultBranch}`;
    log(`Fetching ${baseRef} in ${spec.repository}...`);
    await runCommandAsync(
      "git",
      ["-C", base.repoDir, "fetch", config.git.remote, config.git.defaultBranch],
      longRunningCommandOptions(signal),
    );
    log(
      `Creating worktree ${spec.repository}-${spec.ticket} (branch ${base.branchName} from ${baseRef})...`,
    );
    await runCommandAsync(
      "git",
      ["-C", base.repoDir, "worktree", "add", "-b", base.branchName, base.hostWorktreeDir, baseRef],
      longRunningCommandOptions(signal),
    );
    return {
      repository: spec.repository,
      ticket: spec.ticket,
      branchName: base.branchName,
      dir: base.hostWorktreeDir,
      kind: "host",
    };
  },
  list(config) {
    const projectDir = resolve(config.workspace.projectDir);
    const entries: WorktreeEntry[] = [];

    let projectChildren: Dirent[];
    try {
      projectChildren = readdirSync(projectDir, { withFileTypes: true });
    } catch {
      projectChildren = [];
    }
    for (const entry of projectChildren) {
      if (!entry.isDirectory()) {
        continue;
      }
      const match = TICKET_DIR_RE.exec(entry.name);
      if (!match) {
        continue;
      }
      const [, repository, ticket] = match;
      /* v8 ignore next 3 @preserve -- TICKET_DIR_RE always captures both groups when it matches */
      if (repository === undefined || ticket === undefined) {
        continue;
      }
      if (!config.workspace.knownRepositories.includes(repository)) {
        continue;
      }
      entries.push({
        repository,
        ticket,
        branchName: branchNameForTicket(ticket),
        dir: resolve(projectDir, entry.name),
        kind: "host",
      });
    }

    return entries;
  },
  async remove(config, entry, options) {
    const projectDir = resolve(config.workspace.projectDir);
    const repoDir = resolve(projectDir, entry.repository);

    if (existsSync(entry.dir)) {
      log(`Removing worktree ${entry.dir}${options.force ? " (--force)" : ""}...`);
      const removeArguments = ["-C", repoDir, "worktree", "remove"];
      if (options.force) {
        removeArguments.push("--force");
      }
      removeArguments.push(entry.dir);
      await runCommandAsync("git", removeArguments, longRunningCommandOptions(options.signal));
    } else {
      log(`Worktree directory ${entry.dir} not found, pruning stale refs...`);
      await runCommandAsync(
        "git",
        ["-C", repoDir, "worktree", "prune"],
        longRunningCommandOptions(options.signal),
      );
    }
    await deleteBranchBestEffort({
      cmd: "git",
      cmdArgs: ["-C", repoDir, "branch", "-D", entry.branchName],
      branchName: entry.branchName,
      ...signalProperty(options.signal),
    });
  },
};

const sandboxWorktreeAdapter: WorktreeAdapter = {
  async create(config, spec, signal) {
    const base = basePaths(config, spec.repository, spec.ticket);
    const definition = config.models.definitions[spec.model];
    if (definition?.sandbox === undefined) {
      throw new Error(
        `Cannot resolve docker worktree for model "${spec.model}": no sandbox config defined.`,
      );
    }
    const sandboxName = sandboxNameFor({ repository: spec.repository, model: spec.model });
    const sandboxDir = sandboxWorktreeDirFor({
      repoDir: base.repoDir,
      sandboxName,
      branchName: base.branchName,
    });

    if (!(await sandboxExists(sandboxName, signal))) {
      throw new Error(
        `Persistent sbx sandbox ${sandboxName} not found. Run \`crew sandbox auth ${spec.repository} --model ${spec.model}\` first so OAuth happens before the ticket prompt.`,
      );
    }
    log(
      `Creating sbx worktree ${spec.repository}-${spec.ticket} (branch ${base.branchName}) in ${sandboxName}...`,
    );
    // Sandbox-backed: sbx fetches inside the container, so we skip the
    // host-side fetch.
    await runCommandAsync(
      "sbx",
      ["run", "--branch", base.branchName, sandboxName, "--", "--version"],
      longRunningCommandOptions(signal),
    );
    return {
      repository: spec.repository,
      ticket: spec.ticket,
      branchName: base.branchName,
      dir: sandboxDir,
      kind: "sandbox",
      sandboxName,
    };
  },
  list(config) {
    const projectDir = resolve(config.workspace.projectDir);
    const entries: WorktreeEntry[] = [];

    for (const repository of config.workspace.knownRepositories) {
      const repoDir = resolve(projectDir, repository);
      for (const [model, definition] of Object.entries(config.models.definitions)) {
        if (definition.sandbox === undefined) {
          continue;
        }
        const sandboxName = sandboxNameFor({ repository, model });
        const root = resolve(repoDir, ".sbx", `${sandboxName}-worktrees`);
        let children: Dirent[];
        try {
          children = readdirSync(root, { withFileTypes: true });
        } catch {
          continue;
        }
        for (const entry of children) {
          if (!entry.isDirectory()) {
            continue;
          }
          const ticket = ticketFromBranchDir(entry.name);
          if (ticket === undefined) {
            continue;
          }
          entries.push({
            repository,
            ticket,
            branchName: entry.name,
            dir: resolve(root, entry.name),
            kind: "sandbox",
            sandboxName,
          });
        }
      }
    }

    return entries;
  },
  async remove(config, entry, options) {
    const projectDir = resolve(config.workspace.projectDir);
    const repoDir = resolve(projectDir, entry.repository);
    /* v8 ignore next 3 @preserve -- list() always populates sandboxName for kind==="sandbox" */
    if (entry.sandboxName === undefined) {
      throw new Error(`Sandbox worktree entry missing sandboxName: ${entry.dir}`);
    }
    log(`Removing sbx worktree ${entry.dir}${options.force ? " (--force)" : ""}...`);
    const removeArguments = ["exec", entry.sandboxName, "git", "-C", repoDir, "worktree", "remove"];
    if (options.force) {
      removeArguments.push("--force");
    }
    removeArguments.push(entry.dir);
    await runCommandAsync("sbx", removeArguments, longRunningCommandOptions(options.signal));
    await deleteBranchBestEffort({
      cmd: "sbx",
      cmdArgs: ["exec", entry.sandboxName, "git", "-C", repoDir, "branch", "-D", entry.branchName],
      branchName: entry.branchName,
      ...signalProperty(options.signal),
    });
  },
};

interface SpriteStateFile {
  entries?: unknown;
}

function stateBaseDir(): string {
  const override = readEnvironmentVariable("XDG_STATE_HOME");
  /* v8 ignore next 3 @preserve -- tests set XDG_STATE_HOME to avoid touching the developer's real home */
  if (override !== undefined && override.length > 0) {
    return resolve(override);
  }
  /* v8 ignore next @preserve -- tests set XDG_STATE_HOME to avoid touching the developer's real home */
  return resolve(homedir(), ".local", "state");
}

function spriteStateFilePath(): string {
  return resolve(stateBaseDir(), "groundcrew", "sprite-worktrees.json");
}

function isSpriteEntry(value: unknown): value is WorktreeEntry {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const entry = value as Partial<WorktreeEntry>;
  return (
    typeof entry.repository === "string" &&
    typeof entry.ticket === "string" &&
    typeof entry.branchName === "string" &&
    typeof entry.dir === "string" &&
    entry.kind === "sprite" &&
    typeof entry.spriteName === "string" &&
    typeof entry.remoteRepoDir === "string"
  );
}

function readSpriteEntries(): WorktreeEntry[] {
  try {
    const parsed = JSON.parse(readFileSync(spriteStateFilePath(), "utf8")) as SpriteStateFile;
    return Array.isArray(parsed.entries) ? parsed.entries.filter(isSpriteEntry) : [];
  } catch {
    return [];
  }
}

function writeSpriteEntries(entries: readonly WorktreeEntry[]): void {
  const path = spriteStateFilePath();
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify({ entries }, undefined, 2)}\n`);
}

function upsertSpriteEntry(entry: WorktreeEntry): void {
  writeSpriteEntries([...readSpriteEntries(), entry]);
}

function deleteSpriteEntry(entry: WorktreeEntry): void {
  writeSpriteEntries(
    readSpriteEntries().filter(
      (candidate) =>
        !(
          candidate.repository === entry.repository &&
          candidate.ticket === entry.ticket &&
          candidate.dir === entry.dir &&
          candidate.kind === "sprite"
        ),
    ),
  );
}

function remotePathJoin(root: string, leaf: string): string {
  let end = root.length;
  while (end > 0 && root[end - 1] === "/") {
    end -= 1;
  }
  return `${root.slice(0, end)}/${leaf}`;
}

function repositorySlug(owner: string, repository: string): string {
  return repository.includes("/") ? repository : `${owner}/${repository}`;
}

function repositoryDirectoryName(repository: string): string {
  const name = repository.includes("/")
    ? repository.slice(repository.lastIndexOf("/") + 1)
    : repository;
  return name.endsWith(".git") ? name.slice(0, -4) : name;
}

function spriteCreateCommand(arguments_: {
  owner: string;
  repository: string;
  repoDir: string;
  worktreeDir: string;
  branchName: string;
  baseBranch: string;
  repoRoot: string;
  worktreeRoot: string;
}): string {
  const slug = repositorySlug(arguments_.owner, arguments_.repository);
  return [
    "set -euo pipefail",
    `repo_root=${shellSingleQuote(arguments_.repoRoot)}`,
    `worktree_root=${shellSingleQuote(arguments_.worktreeRoot)}`,
    `repo_dir=${shellSingleQuote(arguments_.repoDir)}`,
    `worktree_dir=${shellSingleQuote(arguments_.worktreeDir)}`,
    `branch=${shellSingleQuote(arguments_.branchName)}`,
    `base_branch=${shellSingleQuote(arguments_.baseBranch)}`,
    'mkdir -p "$repo_root" "$worktree_root"',
    'if [ ! -d "$repo_dir/.git" ]; then',
    `  gh repo clone ${shellSingleQuote(slug)} "$repo_dir"`,
    "fi",
    'git -C "$repo_dir" fetch origin --prune',
    'if [ -e "$worktree_dir" ]; then',
    '  echo "Sprite worktree already exists: $worktree_dir" >&2',
    "  exit 1",
    "fi",
    'if git -C "$repo_dir" show-ref --verify --quiet "refs/remotes/origin/$branch"; then',
    '  git -C "$repo_dir" worktree add -B "$branch" "$worktree_dir" "origin/$branch"',
    "else",
    '  git -C "$repo_dir" worktree add -b "$branch" "$worktree_dir" "origin/$base_branch"',
    "fi",
  ].join("\n");
}

function spriteRemoveCommand(entry: WorktreeEntry, force: boolean): string {
  if (entry.remoteRepoDir === undefined) {
    throw new Error(`Sprite worktree entry missing remoteRepoDir: ${entry.dir}`);
  }
  const removeArguments = [
    "git",
    "-C",
    shellSingleQuote(entry.remoteRepoDir),
    "worktree",
    "remove",
  ];
  if (force) {
    removeArguments.push("--force");
  }
  removeArguments.push(shellSingleQuote(entry.dir));
  return [
    "set -euo pipefail",
    removeArguments.join(" "),
    `git -C ${shellSingleQuote(entry.remoteRepoDir)} branch -D ${shellSingleQuote(entry.branchName)} || true`,
    `git -C ${shellSingleQuote(entry.remoteRepoDir)} worktree prune`,
  ].join("\n");
}

const spriteWorktreeAdapter: WorktreeAdapter = {
  async create(config, spec, signal) {
    const base = basePaths(config, spec.repository, spec.ticket);
    const { sprite } = config.remote;
    const remoteRepositoryName = repositoryDirectoryName(spec.repository);
    const remoteRepoDir = remotePathJoin(sprite.repoRoot, remoteRepositoryName);
    const remoteWorktreeDir = remotePathJoin(
      sprite.worktreeRoot,
      `${remoteRepositoryName}-${spec.ticket}`,
    );

    log(
      `Creating Sprite worktree ${spec.repository}-${spec.ticket} (branch ${base.branchName}) in ${sprite.spriteName}...`,
    );
    await runCommandAsync(
      "sprite",
      [
        "exec",
        "-s",
        sprite.spriteName,
        "--",
        "bash",
        "-lc",
        spriteCreateCommand({
          owner: sprite.owner,
          repository: spec.repository,
          repoDir: remoteRepoDir,
          worktreeDir: remoteWorktreeDir,
          branchName: base.branchName,
          baseBranch: config.git.defaultBranch,
          repoRoot: sprite.repoRoot,
          worktreeRoot: sprite.worktreeRoot,
        }),
      ],
      longRunningCommandOptions(signal),
    );

    const entry: WorktreeEntry = {
      repository: spec.repository,
      ticket: spec.ticket,
      branchName: base.branchName,
      dir: remoteWorktreeDir,
      kind: "sprite",
      spriteName: sprite.spriteName,
      remoteRepoDir,
    };
    upsertSpriteEntry(entry);
    return entry;
  },
  list(config) {
    return readSpriteEntries().filter((entry) =>
      config.workspace.knownRepositories.includes(entry.repository),
    );
  },
  async remove(_config, entry, options) {
    if (entry.spriteName === undefined) {
      throw new Error(`Sprite worktree entry missing spriteName: ${entry.dir}`);
    }
    log(`Removing Sprite worktree ${entry.dir}${options.force ? " (--force)" : ""}...`);
    await runCommandAsync(
      "sprite",
      [
        "exec",
        "-s",
        entry.spriteName,
        "--",
        "bash",
        "-lc",
        spriteRemoveCommand(entry, options.force),
      ],
      longRunningCommandOptions(options.signal),
    );
    deleteSpriteEntry(entry);
  },
};

function adapterForEntry(entry: WorktreeEntry): WorktreeAdapter {
  if (entry.kind === "sprite") {
    return spriteWorktreeAdapter;
  }
  return entry.kind === "sandbox" ? sandboxWorktreeAdapter : hostWorktreeAdapter;
}

function adapterForSpec(spec: WorktreeSpec): WorktreeAdapter {
  if (spec.runner === "sprite") {
    return spriteWorktreeAdapter;
  }
  return spec.strategy === "docker" ? sandboxWorktreeAdapter : hostWorktreeAdapter;
}

/** Returns BOTH kinds for a ticket when both exist; callers must not assume uniqueness. */
function list(config: ResolvedConfig): WorktreeEntry[] {
  return [
    ...hostWorktreeAdapter.list(config),
    ...sandboxWorktreeAdapter.list(config),
    ...spriteWorktreeAdapter.list(config),
  ];
}

function findByTicket(config: ResolvedConfig, ticket: string): WorktreeEntry[] {
  return list(config).filter((entry) => entry.ticket === ticket);
}

function findByBranch(
  config: ResolvedConfig,
  repository: string,
  branchName: string,
): WorktreeEntry | undefined {
  return list(config).find(
    (entry) => entry.repository === repository && entry.branchName === branchName,
  );
}

async function create(
  config: ResolvedConfig,
  spec: WorktreeSpec,
  signal?: AbortSignal,
): Promise<WorktreeEntry> {
  const existing = findByTicket(config, spec.ticket).filter(
    (entry) => entry.repository === spec.repository,
  );
  if (existing.length > 0) {
    const [first] = existing;
    /* v8 ignore next @preserve -- length>0 guarantees [0] is defined */
    throw new Error(`Worktree already exists: ${first?.dir}`);
  }
  return await adapterForSpec(spec).create(config, spec, signal);
}

async function remove(
  config: ResolvedConfig,
  entry: WorktreeEntry,
  options?: { force?: boolean; signal?: AbortSignal },
): Promise<void> {
  await adapterForEntry(entry).remove(config, entry, {
    force: options?.force ?? false,
    ...signalProperty(options?.signal),
  });
}

export type TeardownStep = "workspace_close" | "worktree_remove";

export interface TeardownFailure {
  entry: WorktreeEntry;
  step: TeardownStep;
  error: unknown;
}

export interface TeardownResult {
  /** Tickets whose Workspace was closed (deduped per ticket). */
  closed: string[];
  /** Worktrees successfully removed. */
  removed: WorktreeEntry[];
  /** Per-entry failures; teardown continues past them. */
  failures: TeardownFailure[];
  workspaceProbe: WorkspaceProbe;
}

// A flaky cmux/tmux must not abort the batch — otherwise every on-disk
// worktree gets stranded. The probe verdict is captured on the result and
// removal proceeds with no live-workspace knowledge (so no close attempts).
async function teardown(
  config: ResolvedConfig,
  entries: readonly WorktreeEntry[],
  options?: { force?: boolean; signal?: AbortSignal },
): Promise<TeardownResult> {
  if (entries.length === 0) {
    return {
      closed: [],
      removed: [],
      failures: [],
      workspaceProbe: { kind: "ok", names: new Set<string>() },
    };
  }
  const force = options?.force ?? false;
  const workspaceProbe = await workspaces.probe(config, options?.signal);
  const liveNames = workspaceProbe.kind === "ok" ? workspaceProbe.names : new Set<string>();
  const closedTickets = new Set<string>();
  const result: TeardownResult = {
    closed: [],
    removed: [],
    failures: [],
    workspaceProbe,
  };

  for (const entry of entries) {
    if (
      !closedTickets.has(entry.ticket) &&
      (workspaceProbe.kind === "unavailable" || liveNames.has(entry.ticket))
    ) {
      try {
        // oxlint-disable-next-line no-await-in-loop -- teardown is intentionally sequential per ticket
        await workspaces.close(config, entry.ticket, options?.signal);
        result.closed.push(entry.ticket);
      } catch (error) {
        if (options?.signal?.aborted === true) {
          throw error;
        }
        result.failures.push({ entry, step: "workspace_close", error });
      }
      closedTickets.add(entry.ticket);
    }
    try {
      // oxlint-disable-next-line no-await-in-loop -- one worktree at a time avoids racing on git
      await remove(config, entry, { force, ...signalProperty(options?.signal) });
      result.removed.push(entry);
    } catch (error) {
      if (options?.signal?.aborted === true) {
        throw error;
      }
      result.failures.push({ entry, step: "worktree_remove", error });
    }
  }

  return result;
}

export const worktrees = {
  create,
  list,
  findByTicket,
  findByBranch,
  remove,
  teardown,
};
