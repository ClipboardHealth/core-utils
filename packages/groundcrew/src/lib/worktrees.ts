/**
 * Worktree lifecycle — manages git worktrees for tickets across two kinds:
 *
 * - **Host worktree** — a `git worktree add`'d sibling at
 *   `<projectDir>/<repo>-<TICKET>/`.
 * - **Remote worktree** — a remote git worktree tracked in local state.
 *
 * Each kind has its own adapter. Callers go through the `worktrees`
 * namespace and never branch on kind themselves — the dispatchers below
 * pick the adapter by `spec.runner` (for `create`) or `entry.kind` (for
 * `remove`), mirroring the `workspaces` module's adapter pattern.
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
import { isRemoteRunnerProviderName, type ResolvedConfig, type WorkspaceRunner } from "./config.ts";
import {
  getRemoteRunnerProvider,
  type RemoteRunnerProvider,
} from "./spriteRemoteRunnerProvider.ts";
import { errorMessage, log, readEnvironmentVariable } from "./util.ts";
import { type WorkspaceProbe, workspaces } from "./workspaces.ts";

const LONG_RUNNING_COMMAND_OPTIONS = { stdio: "inherit", timeoutMs: 0 } as const;

export type WorktreeKind = "host" | "remote";

export interface WorktreeEntry {
  repository: string;
  /** Linear ticket id, lowercased — e.g. "team-220". */
  ticket: string;
  /** Lowercase, slash-free `<user>-<ticket>`. */
  branchName: string;
  dir: string;
  kind: WorktreeKind;
  /** Set iff `kind === "remote"`. */
  remoteProvider?: ResolvedConfig["remote"]["provider"];
  /** Set iff `kind === "remote"`. */
  remoteRunnerName?: string;
  /** Set iff `kind === "remote"`. */
  remoteRepoDir?: string;
}

export interface WorktreeSpec {
  repository: string;
  ticket: string;
  model: string;
  runner?: WorkspaceRunner;
}

const TICKET_RE = /^[a-z][\da-z]*-\d+$/;
const TICKET_DIR_RE = /^(.+)-([a-z][\da-z]*-\d+)$/;

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

    // Worktrees live at `projectDir/<repository>-<ticket>`. When `repository`
    // contains a slash (e.g. "owner/repo"), `resolve()` nests one level
    // deeper, so the worktree path is `projectDir/owner/repo-<ticket>`.
    // Scan each known repository's parent directory rather than the project
    // root, so nested worktrees are discovered alongside bare ones.
    const reposByParent = new Map<string, Map<string, string>>();
    for (const repository of config.workspace.knownRepositories) {
      const lastSlash = repository.lastIndexOf("/");
      const parentDir =
        lastSlash === -1 ? projectDir : resolve(projectDir, repository.slice(0, lastSlash));
      const basename = lastSlash === -1 ? repository : repository.slice(lastSlash + 1);
      let repoByBasename = reposByParent.get(parentDir);
      if (repoByBasename === undefined) {
        repoByBasename = new Map();
        reposByParent.set(parentDir, repoByBasename);
      }
      repoByBasename.set(basename, repository);
    }

    for (const [parentDir, repoByBasename] of reposByParent) {
      let children: Dirent[];
      try {
        children = readdirSync(parentDir, { withFileTypes: true });
      } catch {
        children = [];
      }
      for (const entry of children) {
        if (!entry.isDirectory()) {
          continue;
        }
        const match = TICKET_DIR_RE.exec(entry.name);
        if (!match) {
          continue;
        }
        const [, repoBasename, ticket] = match;
        /* v8 ignore next 3 @preserve -- TICKET_DIR_RE always captures both groups when it matches */
        if (repoBasename === undefined || ticket === undefined) {
          continue;
        }
        const repository = repoByBasename.get(repoBasename);
        if (repository === undefined) {
          continue;
        }
        entries.push({
          repository,
          ticket,
          branchName: branchNameForTicket(ticket),
          dir: resolve(parentDir, entry.name),
          kind: "host",
        });
      }
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

interface RemoteStateFile {
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

function remoteStateFilePath(): string {
  return resolve(stateBaseDir(), "groundcrew", "remote-worktrees.json");
}

function isRemoteEntry(value: unknown): value is WorktreeEntry {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const entry = value as Partial<WorktreeEntry>;
  return (
    typeof entry.repository === "string" &&
    typeof entry.ticket === "string" &&
    typeof entry.branchName === "string" &&
    typeof entry.dir === "string" &&
    entry.kind === "remote" &&
    isRemoteRunnerProviderName(entry.remoteProvider) &&
    typeof entry.remoteRunnerName === "string" &&
    typeof entry.remoteRepoDir === "string"
  );
}

function readRemoteEntries(): WorktreeEntry[] {
  try {
    const parsed = JSON.parse(readFileSync(remoteStateFilePath(), "utf8")) as RemoteStateFile;
    return Array.isArray(parsed.entries) ? parsed.entries.filter(isRemoteEntry) : [];
  } catch {
    return [];
  }
}

function writeRemoteEntries(entries: readonly WorktreeEntry[]): void {
  const path = remoteStateFilePath();
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify({ entries }, undefined, 2)}\n`);
}

function upsertRemoteEntry(entry: WorktreeEntry): void {
  writeRemoteEntries([...readRemoteEntries(), entry]);
}

function deleteRemoteEntry(entry: WorktreeEntry): void {
  writeRemoteEntries(
    readRemoteEntries().filter(
      (candidate) =>
        !(
          candidate.repository === entry.repository &&
          candidate.ticket === entry.ticket &&
          candidate.dir === entry.dir &&
          candidate.kind === "remote"
        ),
    ),
  );
}

function remoteProviderFor(config: ResolvedConfig, entry?: WorktreeEntry): RemoteRunnerProvider {
  return getRemoteRunnerProvider(entry?.remoteProvider ?? config.remote.provider);
}

const remoteWorktreeAdapter: WorktreeAdapter = {
  async create(config, spec, signal) {
    const base = basePaths(config, spec.repository, spec.ticket);
    log(
      `Creating remote worktree ${spec.repository}-${spec.ticket} (branch ${base.branchName}) in ${config.remote.provider}:${config.remote.runnerName}...`,
    );
    const provider = remoteProviderFor(config);
    const { remoteRepoDir, remoteWorktreeDir } = await provider.createWorktree({
      config: config.remote,
      repository: spec.repository,
      ticket: spec.ticket,
      branchName: base.branchName,
      baseBranch: config.git.defaultBranch,
      ...signalProperty(signal),
    });

    const entry: WorktreeEntry = {
      repository: spec.repository,
      ticket: spec.ticket,
      branchName: base.branchName,
      dir: remoteWorktreeDir,
      kind: "remote",
      remoteProvider: config.remote.provider,
      remoteRunnerName: config.remote.runnerName,
      remoteRepoDir,
    };
    upsertRemoteEntry(entry);
    return entry;
  },
  list(config) {
    return readRemoteEntries().filter((entry) =>
      config.workspace.knownRepositories.includes(entry.repository),
    );
  },
  async remove(config, entry, options) {
    log(`Removing remote worktree ${entry.dir}${options.force ? " (--force)" : ""}...`);
    const remoteConfig = {
      ...config.remote,
      provider: entry.remoteProvider ?? config.remote.provider,
      runnerName: entry.remoteRunnerName ?? config.remote.runnerName,
    };
    await remoteProviderFor(config, entry).removeWorktree({
      config: remoteConfig,
      entry,
      force: options.force,
      ...signalProperty(options.signal),
    });
    deleteRemoteEntry(entry);
  },
};

function adapterForEntry(entry: WorktreeEntry): WorktreeAdapter {
  if (entry.kind === "host") {
    return hostWorktreeAdapter;
  }
  if (entry.kind === "remote") {
    return remoteWorktreeAdapter;
  }
  throw new Error(`Unknown worktree kind: ${JSON.stringify(entry.kind)}`);
}

function adapterForSpec(spec: WorktreeSpec): WorktreeAdapter {
  if (spec.runner === undefined || spec.runner === "local") {
    return hostWorktreeAdapter;
  }
  if (spec.runner === "remote") {
    return remoteWorktreeAdapter;
  }
  throw new Error(`Unknown workspace runner: ${JSON.stringify(spec.runner)}`);
}

/** Returns every tracked worktree kind for a ticket; callers must not assume uniqueness. */
function list(config: ResolvedConfig): WorktreeEntry[] {
  return [...hostWorktreeAdapter.list(config), ...remoteWorktreeAdapter.list(config)];
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
