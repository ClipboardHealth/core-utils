import { runCommandAsync, type RunCommandOptions } from "./commandRunner.ts";
import type { RemoteRunnerConfig, RemoteRunnerProviderName } from "./config.ts";
import { shellSingleQuote } from "./shell.ts";

const LONG_RUNNING_COMMAND_OPTIONS = { stdio: "inherit", timeoutMs: 0 } as const;

export const SPRITE_REMOTE_PROVIDER_DEFAULTS = {
  provider: "sprite",
  runnerName: "crew-claude-1",
  owner: "ClipboardHealth",
  repoRoot: "/home/sprite/dev",
  worktreeRoot: "/home/sprite/groundcrew/worktrees",
} as const satisfies Omit<RemoteRunnerConfig, "secretNames">;

interface RemoteFileUpload {
  localPath: string;
  remotePath: string;
}

interface RemoteRunArguments {
  config: RemoteRunnerConfig;
  remoteArguments: readonly string[];
  files?: readonly RemoteFileUpload[];
  workingDirectory?: string;
  options?: RunCommandOptions;
}

interface RemoteTtyCommandArguments {
  config: RemoteRunnerConfig;
  remoteArguments: readonly string[];
  files?: readonly RemoteFileUpload[];
  workingDirectory?: string;
}

interface RemoteWorktreeCreateArguments {
  config: RemoteRunnerConfig;
  repository: string;
  ticket: string;
  branchName: string;
  baseBranch: string;
  signal?: AbortSignal;
}

interface RemoteWorktreeLocation {
  remoteRepoDir: string;
  remoteWorktreeDir: string;
}

interface RemoteWorktreeRemoveArguments {
  config: RemoteRunnerConfig;
  entry: {
    branchName: string;
    dir: string;
    remoteRepoDir?: string;
    remoteRunnerName?: string;
  };
  force: boolean;
  signal?: AbortSignal;
}

export interface RemoteRunnerProvider {
  name: RemoteRunnerProviderName;
  runnerExists(config: RemoteRunnerConfig): Promise<boolean>;
  createRunner(config: RemoteRunnerConfig): Promise<void>;
  runCommand(arguments_: RemoteRunArguments): Promise<string | undefined>;
  runTtyCommand(arguments_: RemoteRunArguments): Promise<void>;
  buildTtyCommand(arguments_: RemoteTtyCommandArguments): string;
  listSessions(config: RemoteRunnerConfig): Promise<string>;
  attachSession(config: RemoteRunnerConfig, target: string): Promise<void>;
  listProcesses(config: RemoteRunnerConfig): Promise<string>;
  interruptProcessGroup(config: RemoteRunnerConfig, processGroupId: string): Promise<void>;
  checkpoint(config: RemoteRunnerConfig, comment: string): Promise<void>;
  createWorktree(arguments_: RemoteWorktreeCreateArguments): Promise<RemoteWorktreeLocation>;
  removeWorktree(arguments_: RemoteWorktreeRemoveArguments): Promise<void>;
}

function longRunningCommandOptions(signal?: AbortSignal): RunCommandOptions & { stdio: "inherit" } {
  return signal === undefined
    ? LONG_RUNNING_COMMAND_OPTIONS
    : { ...LONG_RUNNING_COMMAND_OPTIONS, signal };
}

function escapeRegExp(value: string): string {
  return value.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);
}

function spriteFileArguments(files: readonly RemoteFileUpload[] = []): string[] {
  return files.flatMap((file) => ["--file", `${file.localPath}:${file.remotePath}`]);
}

function spriteExecArguments(arguments_: RemoteRunArguments): string[] {
  const args = [
    "exec",
    "-s",
    arguments_.config.runnerName,
    ...spriteFileArguments(arguments_.files),
  ];
  if (arguments_.workingDirectory !== undefined) {
    args.push("--dir", arguments_.workingDirectory);
  }
  args.push("--", ...arguments_.remoteArguments);
  return args;
}

function spriteTtyExecArguments(arguments_: RemoteRunArguments): string[] {
  const args = [
    "exec",
    "--tty",
    "-s",
    arguments_.config.runnerName,
    ...spriteFileArguments(arguments_.files),
  ];
  if (arguments_.workingDirectory !== undefined) {
    args.push("--dir", arguments_.workingDirectory);
  }
  args.push("--", ...arguments_.remoteArguments);
  return args;
}

async function runSprite(
  args: readonly string[],
  options: RunCommandOptions | undefined,
): Promise<string | undefined> {
  if (options?.stdio === "inherit") {
    const inheritedOptions: RunCommandOptions & { stdio: "inherit" } = {
      ...options,
      stdio: "inherit",
    };
    await runCommandAsync("sprite", args, inheritedOptions);
    return undefined;
  }
  return await runCommandAsync("sprite", args, capturedRunOptions(options));
}

function capturedRunOptions(
  options: RunCommandOptions | undefined,
): (RunCommandOptions & { stdio?: "captured" }) | undefined {
  if (options === undefined) {
    return undefined;
  }
  const { stdio, ...rest } = options;
  if (stdio === undefined) {
    return rest;
  }
  if (stdio === "inherit") {
    throw new Error("Inherited stdio options must be handled before capturedRunOptions.");
  }
  return { ...rest, stdio };
}

function buildSpriteTtyCommand(arguments_: RemoteTtyCommandArguments): string {
  const files = (arguments_.files ?? []).map(
    (file) => `--file ${shellSingleQuote(`${file.localPath}:${file.remotePath}`)}`,
  );
  const workingDirectory =
    arguments_.workingDirectory === undefined
      ? []
      : ["--dir", shellSingleQuote(arguments_.workingDirectory)];
  return [
    "sprite exec --tty",
    "-s",
    shellSingleQuote(arguments_.config.runnerName),
    ...files,
    ...workingDirectory,
    "--",
    ...arguments_.remoteArguments.map(shellSingleQuote),
  ].join(" ");
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

function spriteCreateWorktreeCommand(arguments_: {
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
    '  echo "Remote worktree already exists: $worktree_dir" >&2',
    "  exit 1",
    "fi",
    'if git -C "$repo_dir" show-ref --verify --quiet "refs/remotes/origin/$branch"; then',
    '  git -C "$repo_dir" worktree add -B "$branch" "$worktree_dir" "origin/$branch"',
    "else",
    '  git -C "$repo_dir" worktree add -b "$branch" "$worktree_dir" "origin/$base_branch"',
    "fi",
  ].join("\n");
}

function spriteRemoveWorktreeCommand(
  entry: RemoteWorktreeRemoveArguments["entry"],
  force: boolean,
): string {
  if (entry.remoteRepoDir === undefined) {
    throw new Error(`Remote worktree entry missing remoteRepoDir: ${entry.dir}`);
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

async function spriteRunnerExists(config: RemoteRunnerConfig): Promise<boolean> {
  const output = await runCommandAsync("sprite", ["list", "--sprite", config.runnerName]);
  return new RegExp(`(^|\\s)${escapeRegExp(config.runnerName)}(\\s|$)`, "m").test(output);
}

async function createSpriteRunner(config: RemoteRunnerConfig): Promise<void> {
  await runCommandAsync("sprite", ["create", "--skip-console", config.runnerName], {
    stdio: "inherit",
    timeoutMs: 0,
  });
}

export const spriteRemoteRunnerProvider: RemoteRunnerProvider = {
  name: "sprite",
  async runnerExists(config) {
    return await spriteRunnerExists(config);
  },
  async createRunner(config) {
    await createSpriteRunner(config);
  },
  async runCommand(arguments_) {
    return await runSprite(spriteExecArguments(arguments_), arguments_.options);
  },
  async runTtyCommand(arguments_) {
    await runSprite(spriteTtyExecArguments(arguments_), {
      ...arguments_.options,
      stdio: "inherit",
      timeoutMs: arguments_.options?.timeoutMs ?? 0,
    });
  },
  buildTtyCommand: buildSpriteTtyCommand,
  async listSessions(config) {
    const output = await runCommandAsync("sprite", ["sessions", "list", "-s", config.runnerName], {
      trim: false,
    });
    return output;
  },
  async attachSession(config, target) {
    await runCommandAsync("sprite", ["attach", "-s", config.runnerName, target], {
      stdio: "inherit",
      timeoutMs: 0,
    });
  },
  async listProcesses(config) {
    return await runCommandAsync(
      "sprite",
      [
        "exec",
        "-s",
        config.runnerName,
        "--",
        "ps",
        "-eo",
        "pid,ppid,pgid,sid,stat,etime,pcpu,pmem,cmd",
      ],
      { trim: false },
    );
  },
  async interruptProcessGroup(config, processGroupId) {
    await runCommandAsync(
      "sprite",
      ["exec", "-s", config.runnerName, "--", "kill", "-INT", "--", `-${processGroupId}`],
      { stdio: "inherit" },
    );
  },
  async checkpoint(config, comment) {
    await runCommandAsync(
      "sprite",
      ["checkpoint", "create", "-s", config.runnerName, "--comment", comment],
      {
        stdio: "inherit",
        timeoutMs: 0,
      },
    );
  },
  async createWorktree(arguments_) {
    const { config, repository, ticket, branchName, baseBranch, signal } = arguments_;
    const remoteRepositoryName = repositoryDirectoryName(repository);
    const remoteRepoDir = remotePathJoin(config.repoRoot, remoteRepositoryName);
    const remoteWorktreeDir = remotePathJoin(
      config.worktreeRoot,
      `${remoteRepositoryName}-${ticket}`,
    );

    await runCommandAsync(
      "sprite",
      [
        "exec",
        "-s",
        config.runnerName,
        "--",
        "bash",
        "-lc",
        spriteCreateWorktreeCommand({
          owner: config.owner,
          repository,
          repoDir: remoteRepoDir,
          worktreeDir: remoteWorktreeDir,
          branchName,
          baseBranch,
          repoRoot: config.repoRoot,
          worktreeRoot: config.worktreeRoot,
        }),
      ],
      longRunningCommandOptions(signal),
    );

    return { remoteRepoDir, remoteWorktreeDir };
  },
  async removeWorktree(arguments_) {
    const { entry, force, signal } = arguments_;
    if (entry.remoteRunnerName === undefined) {
      throw new Error(`Remote worktree entry missing remoteRunnerName: ${entry.dir}`);
    }
    await runCommandAsync(
      "sprite",
      [
        "exec",
        "-s",
        entry.remoteRunnerName,
        "--",
        "bash",
        "-lc",
        spriteRemoveWorktreeCommand(entry, force),
      ],
      longRunningCommandOptions(signal),
    );
  },
};

export function remoteConfigWithRunnerName(runnerName: string): RemoteRunnerConfig {
  return {
    ...SPRITE_REMOTE_PROVIDER_DEFAULTS,
    runnerName,
    secretNames: [],
  };
}

export function getRemoteRunnerProvider(provider: RemoteRunnerProviderName): RemoteRunnerProvider {
  if (provider === "sprite") {
    return spriteRemoteRunnerProvider;
  }
  throw new Error(`Unknown remote provider: ${JSON.stringify(provider)}`);
}
