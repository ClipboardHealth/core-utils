import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { runCommandAsync } from "../lib/commandRunner.ts";
import { BUILD_SECRET_NAMES, DEFAULT_SANDBOX_SETUP_COMMAND, loadConfig } from "../lib/config.ts";
import { shellSingleQuote } from "../lib/launchCommand.ts";
import { log, readEnvironmentVariable, writeOutput } from "../lib/util.ts";

const KNOWN_MCP_SERVER_URLS: Record<string, string> = {
  linear: "https://mcp.linear.app/mcp",
  slack: "https://mcp.slack.com/mcp",
  notion: "https://mcp.notion.com/mcp",
};

export interface McpServer {
  name: string;
  url: string;
}

export interface SpriteSetupOptions {
  spriteName: string;
  shouldCreate: boolean;
  shouldAuthenticateClaude: boolean;
  shouldAuthenticateCodex: boolean;
  shouldCopyLocalCodexAuth?: boolean;
  shouldAuthenticateGithub: boolean;
  shouldAuthenticateMcp: boolean;
  shouldCheckpoint: boolean;
  checkpointComment: string;
  gitName?: string;
  gitEmail?: string;
  mcpServers: McpServer[];
}

export interface SpriteBootstrapOptions {
  spriteName: string;
  repository: string;
  owner: string;
  baseBranch: string;
  secretNames: string[];
  shouldRequireSelectedSecrets: boolean;
  shouldUseSecrets: boolean;
  branchName?: string;
}

export interface SpriteSessionsOptions {
  spriteName?: string;
}

export interface SpriteAttachOptions {
  target: string;
  spriteName?: string;
}

const DEFAULT_CHECKPOINT_COMMENT =
  "groundcrew sprite baseline: selected agent auth, git identity, and MCP config";
const CLAUDE_SUBSCRIPTION_LOGIN_FLAG = ["--claude", "ai"].join("");
const DEFAULT_REPOSITORY_OWNER = "ClipboardHealth";
const DEFAULT_BASE_BRANCH = "main";
const REMOTE_SECRETS_FILE = "/tmp/groundcrew-build-secrets.env";
const REMOTE_CODEX_AUTH_UPLOAD_FILE = "/tmp/groundcrew-codex-auth.json";
const REMOTE_CODEX_AUTH_FILE = "/home/sprite/.codex/auth.json";

function usage(): string {
  return [
    "Usage:",
    "  crew sprite setup <sprite-name> [options]",
    "  crew sprite bootstrap <sprite-name> <repository> [options]",
    "  crew sprite sessions [<sprite-name>]",
    "  crew sprite attach <session-id-or-command> [--sprite <sprite-name>]",
    "",
    "Setup options:",
    "  --claude                    Authenticate Claude Code with a Claude subscription",
    "  --codex                     Authenticate Codex CLI",
    "  --copy-local-codex-auth     With --codex, copy local CODEX_HOME auth.json into the sprite",
    "  --github                    Authenticate gh for GitHub PRs",
    "  --mcp <alias|name=url>      Add/authenticate one MCP server; repeat for multiple",
    "                              Known aliases: linear, slack, notion",
    "  --skip-mcp-auth             Add selected MCP servers but do not launch Claude /mcp",
    "  --git-name <name>           Set git user.name inside the sprite",
    "  --git-email <email>         Set git user.email inside the sprite",
    "  --checkpoint                Create a checkpoint after setup",
    "  --checkpoint-comment <text> Override the checkpoint comment",
    "  --no-create                 Require the sprite to already exist",
    "",
    "Example:",
    "  crew sprite setup crew-claude-1 --claude --github --mcp linear --mcp slack --checkpoint",
    "",
    "Bootstrap options:",
    "  --branch <branch>           Checkout/create a ticket branch before installing deps",
    "  --base <branch>             Base branch used when creating a missing branch (default: main)",
    "  --owner <owner>             GitHub owner for bare repo names (default: ClipboardHealth)",
    "  --secret <env-name>         Forward one required build secret; repeat for multiple",
    "  --no-secrets                Do not forward NPM_TOKEN/BUF_TOKEN even if present",
    "",
    "Bootstrap example:",
    "  crew sprite bootstrap crew-claude-1 core-utils --branch rocky-team-123",
    "",
    "Session examples:",
    "  crew sprite sessions",
    "  crew sprite attach 12345",
  ].join("\n");
}

function requireValue(arguments_: readonly string[], index: number, flag: string): string {
  const value = arguments_[index + 1];
  if (value === undefined || value.length === 0 || value.startsWith("--")) {
    throw new Error(`${flag} requires a value.\n${usage()}`);
  }
  return value;
}

function validateMcpName(name: string): void {
  if (!/^[a-z][a-z0-9_-]*$/i.test(name)) {
    throw new Error(`Invalid MCP server name "${name}". Use letters, numbers, "_" or "-".`);
  }
}

function validateMcpUrl(url: string): void {
  try {
    const parsedUrl = new URL(url);
    if (parsedUrl.protocol === "https:") {
      return;
    }
  } catch {
    // Fall through to the user-facing validation error below.
  }
  throw new Error(`Invalid MCP server URL "${url}". Remote MCP URLs must start with https://.`);
}

function validateRepository(value: string): void {
  const parts = value.split("/");
  if (parts.length > 2 || parts.some((part) => part.length === 0)) {
    throw new Error(`Invalid repository "${value}". Use repo or owner/repo.`);
  }
  for (const part of parts) {
    validateRepositoryOwner(part);
  }
}

function validateRepositoryOwner(value: string): void {
  if (!/^[\w.-]+$/.test(value)) {
    throw new Error(`Invalid repository owner "${value}".`);
  }
}

function validateGitRef(value: string, label: string): void {
  if (!/^[\w./-]+$/.test(value) || value.includes("..") || value.startsWith("-")) {
    throw new Error(`Invalid ${label} "${value}".`);
  }
}

function validateSecretName(value: string): void {
  if (!/^[A-Z_][A-Z0-9_]*$/.test(value)) {
    throw new Error(`Invalid secret name "${value}". Use an environment variable name.`);
  }
}

function escapeRegExp(value: string): string {
  return value.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);
}

function parseMcpServer(value: string): McpServer {
  const separatorIndex = value.indexOf("=");
  if (separatorIndex !== -1) {
    const name = value.slice(0, separatorIndex).trim();
    const url = value.slice(separatorIndex + 1).trim();
    validateMcpName(name);
    validateMcpUrl(url);
    return { name, url };
  }

  const alias = value.toLowerCase();
  const url = KNOWN_MCP_SERVER_URLS[alias];
  if (url === undefined) {
    throw new Error(
      `Unknown MCP alias "${value}". Known aliases: ${Object.keys(KNOWN_MCP_SERVER_URLS).join(", ")}. Use name=https://example.com/mcp for custom servers.`,
    );
  }
  return { name: alias, url };
}

function parseArguments(argv: readonly string[]): SpriteSetupOptions {
  const [spriteName] = argv;
  if (spriteName === undefined || spriteName.startsWith("--")) {
    throw new Error(usage());
  }

  let shouldCreate = true;
  let shouldAuthenticateClaude = false;
  let shouldAuthenticateCodex = false;
  let shouldCopyLocalCodexAuth = false;
  let shouldAuthenticateGithub = false;
  let shouldAuthenticateMcp = true;
  let shouldCheckpoint = false;
  let checkpointComment = DEFAULT_CHECKPOINT_COMMENT;
  let gitName: string | undefined;
  let gitEmail: string | undefined;
  const mcpServers: McpServer[] = [];

  for (let index = 1; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--claude") {
      shouldAuthenticateClaude = true;
      continue;
    }
    if (argument === "--codex") {
      shouldAuthenticateCodex = true;
      continue;
    }
    if (argument === "--copy-local-codex-auth") {
      shouldAuthenticateCodex = true;
      shouldCopyLocalCodexAuth = true;
      continue;
    }
    if (argument === "--github") {
      shouldAuthenticateGithub = true;
      continue;
    }
    if (argument === "--mcp") {
      const value = requireValue(argv, index, "--mcp");
      mcpServers.push(parseMcpServer(value));
      index += 1;
      continue;
    }
    if (argument === "--skip-mcp-auth") {
      shouldAuthenticateMcp = false;
      continue;
    }
    if (argument === "--git-name") {
      gitName = requireValue(argv, index, "--git-name");
      index += 1;
      continue;
    }
    if (argument === "--git-email") {
      gitEmail = requireValue(argv, index, "--git-email");
      index += 1;
      continue;
    }
    if (argument === "--checkpoint") {
      shouldCheckpoint = true;
      continue;
    }
    if (argument === "--checkpoint-comment") {
      checkpointComment = requireValue(argv, index, "--checkpoint-comment");
      shouldCheckpoint = true;
      index += 1;
      continue;
    }
    if (argument === "--no-create") {
      shouldCreate = false;
      continue;
    }
    throw new Error(`Unknown sprite setup argument: ${argument}\n${usage()}`);
  }

  return {
    spriteName,
    shouldCreate,
    shouldAuthenticateClaude,
    shouldAuthenticateCodex,
    shouldCopyLocalCodexAuth,
    shouldAuthenticateGithub,
    shouldAuthenticateMcp,
    shouldCheckpoint,
    checkpointComment,
    mcpServers,
    ...(gitName === undefined ? {} : { gitName }),
    ...(gitEmail === undefined ? {} : { gitEmail }),
  };
}

function parseBootstrapArguments(argv: readonly string[]): SpriteBootstrapOptions {
  const [spriteName, repository] = argv;
  if (
    spriteName === undefined ||
    spriteName.startsWith("--") ||
    repository === undefined ||
    repository.startsWith("--")
  ) {
    throw new Error(usage());
  }
  validateRepository(repository);

  let owner = DEFAULT_REPOSITORY_OWNER;
  let baseBranch = DEFAULT_BASE_BRANCH;
  let branchName: string | undefined;
  let shouldUseSecrets = true;
  let shouldRequireSelectedSecrets = false;
  const selectedSecretNames: string[] = [];

  for (let index = 2; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--branch") {
      branchName = requireValue(argv, index, "--branch");
      validateGitRef(branchName, "branch");
      index += 1;
      continue;
    }
    if (argument === "--base") {
      baseBranch = requireValue(argv, index, "--base");
      validateGitRef(baseBranch, "base branch");
      index += 1;
      continue;
    }
    if (argument === "--owner") {
      owner = requireValue(argv, index, "--owner");
      validateRepositoryOwner(owner);
      index += 1;
      continue;
    }
    if (argument === "--secret") {
      const secretName = requireValue(argv, index, "--secret");
      validateSecretName(secretName);
      selectedSecretNames.push(secretName);
      shouldRequireSelectedSecrets = true;
      index += 1;
      continue;
    }
    if (argument === "--no-secrets") {
      shouldUseSecrets = false;
      continue;
    }
    throw new Error(`Unknown sprite bootstrap argument: ${argument}\n${usage()}`);
  }

  return {
    spriteName,
    repository,
    owner,
    baseBranch,
    secretNames: selectedSecretNames.length > 0 ? selectedSecretNames : [...BUILD_SECRET_NAMES],
    shouldRequireSelectedSecrets,
    shouldUseSecrets,
    ...(branchName === undefined ? {} : { branchName }),
  };
}

function parseSessionsArguments(argv: readonly string[]): SpriteSessionsOptions {
  if (argv.length === 0) {
    return {};
  }

  const [spriteName, ...rest] = argv;
  if (
    spriteName === undefined ||
    spriteName.length === 0 ||
    spriteName.startsWith("--") ||
    rest.length > 0
  ) {
    throw new Error(usage());
  }

  return { spriteName };
}

function parseAttachArguments(argv: readonly string[]): SpriteAttachOptions {
  const [target] = argv;
  if (target === undefined || target.length === 0 || target.startsWith("--")) {
    throw new Error(usage());
  }

  let spriteName: string | undefined;
  for (let index = 1; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--sprite") {
      spriteName = requireValue(argv, index, "--sprite");
      index += 1;
      continue;
    }
    throw new Error(usage());
  }

  return {
    target,
    ...(spriteName === undefined ? {} : { spriteName }),
  };
}

function spriteExecArguments(spriteName: string, remoteArguments: readonly string[]): string[] {
  return ["exec", "-s", spriteName, "--", ...remoteArguments];
}

function spriteTtyExecArguments(spriteName: string, remoteArguments: readonly string[]): string[] {
  return ["exec", "--tty", "-s", spriteName, "--", ...remoteArguments];
}

async function commandSucceeds(command: string, arguments_: readonly string[]): Promise<boolean> {
  try {
    await runCommandAsync(command, arguments_);
    return true;
  } catch {
    return false;
  }
}

async function spriteExists(spriteName: string): Promise<boolean> {
  const output = await runCommandAsync("sprite", ["list", "--sprite", spriteName]);
  return new RegExp(`(^|\\s)${escapeRegExp(spriteName)}(\\s|$)`, "m").test(output);
}

async function ensureSprite(options: SpriteSetupOptions): Promise<void> {
  if (await spriteExists(options.spriteName)) {
    log(`Reusing existing sprite ${options.spriteName}`);
    return;
  }
  if (!options.shouldCreate) {
    throw new Error(`Sprite ${options.spriteName} does not exist and --no-create was set.`);
  }
  log(`Creating sprite ${options.spriteName}`);
  await runCommandAsync("sprite", ["create", "--skip-console", options.spriteName], {
    stdio: "inherit",
    timeoutMs: 0,
  });
}

async function prepareHome(spriteName: string): Promise<void> {
  await runCommandAsync(
    "sprite",
    spriteExecArguments(spriteName, [
      "bash",
      "-lc",
      "mkdir -p ~/dev ~/.config/groundcrew ~/.local/state/groundcrew",
    ]),
  );
}

async function configureGit(options: SpriteSetupOptions): Promise<void> {
  if (options.gitName !== undefined) {
    await runCommandAsync(
      "sprite",
      spriteExecArguments(options.spriteName, [
        "git",
        "config",
        "--global",
        "user.name",
        options.gitName,
      ]),
    );
  }
  if (options.gitEmail !== undefined) {
    await runCommandAsync(
      "sprite",
      spriteExecArguments(options.spriteName, [
        "git",
        "config",
        "--global",
        "user.email",
        options.gitEmail,
      ]),
    );
  }
}

async function authenticateGithub(spriteName: string): Promise<void> {
  const isAuthenticated = await commandSucceeds(
    "sprite",
    spriteExecArguments(spriteName, ["gh", "auth", "status"]),
  );
  if (!isAuthenticated) {
    log("Starting GitHub device auth inside the sprite");
    await runCommandAsync(
      "sprite",
      spriteExecArguments(spriteName, [
        "gh",
        "auth",
        "login",
        "-h",
        "github.com",
        "-p",
        "https",
        "-w",
      ]),
      { stdio: "inherit", timeoutMs: 0 },
    );
  }
  await runCommandAsync("sprite", spriteExecArguments(spriteName, ["gh", "auth", "setup-git"]));
}

async function authenticateClaude(spriteName: string): Promise<void> {
  const isAuthenticated = await commandSucceeds(
    "sprite",
    spriteExecArguments(spriteName, ["claude", "auth", "status"]),
  );
  if (isAuthenticated) {
    return;
  }
  log("Starting Claude subscription auth inside the sprite");
  await runCommandAsync(
    "sprite",
    spriteTtyExecArguments(spriteName, ["claude", "auth", "login", CLAUDE_SUBSCRIPTION_LOGIN_FLAG]),
    { stdio: "inherit", timeoutMs: 0 },
  );
}

function localCodexAuthFile(): string {
  const codexHome = readEnvironmentVariable("CODEX_HOME");
  /* v8 ignore next 2 @preserve -- tests pass CODEX_HOME explicitly to avoid depending on the developer's real home */
  const baseDir =
    codexHome === undefined || codexHome.length === 0 ? join(homedir(), ".codex") : codexHome;
  return resolve(baseDir, "auth.json");
}

async function validateCodexLogin(spriteName: string): Promise<boolean> {
  return await commandSucceeds(
    "sprite",
    spriteExecArguments(spriteName, ["codex", "login", "status"]),
  );
}

async function copyLocalCodexAuth(spriteName: string): Promise<void> {
  const authFile = localCodexAuthFile();
  if (!existsSync(authFile)) {
    throw new Error(`Local Codex auth file not found: ${authFile}`);
  }
  log("Copying local Codex auth into the sprite");
  await runCommandAsync("sprite", [
    "exec",
    "-s",
    spriteName,
    "--file",
    `${authFile}:${REMOTE_CODEX_AUTH_UPLOAD_FILE}`,
    "--",
    "bash",
    "-lc",
    [
      "mkdir -p /home/sprite/.codex",
      `install -m 600 ${shellSingleQuote(REMOTE_CODEX_AUTH_UPLOAD_FILE)} ${shellSingleQuote(REMOTE_CODEX_AUTH_FILE)}`,
      `rm -f ${shellSingleQuote(REMOTE_CODEX_AUTH_UPLOAD_FILE)}`,
    ].join(" && "),
  ]);
}

async function authenticateCodex(spriteName: string, shouldCopyLocalAuth: boolean): Promise<void> {
  if (await validateCodexLogin(spriteName)) {
    return;
  }
  if (shouldCopyLocalAuth) {
    await copyLocalCodexAuth(spriteName);
    if (await validateCodexLogin(spriteName)) {
      return;
    }
    throw new Error(
      "Codex auth copy completed, but `codex login status` still reports not logged in inside the Sprite. Re-run `crew sprite setup <sprite-name> --codex --copy-local-codex-auth` after refreshing local Codex auth.",
    );
  }
  log("Starting Codex auth inside the sprite");
  await runCommandAsync("sprite", spriteTtyExecArguments(spriteName, ["codex", "login"]), {
    stdio: "inherit",
    timeoutMs: 0,
  });
  if (await validateCodexLogin(spriteName)) {
    return;
  }
  throw new Error(
    "Codex login finished, but `codex login status` still reports not logged in inside the Sprite. Try `crew sprite setup <sprite-name> --codex --copy-local-codex-auth`.",
  );
}

async function addMcpServer(spriteName: string, server: McpServer): Promise<void> {
  const exists = await commandSucceeds(
    "sprite",
    spriteExecArguments(spriteName, ["claude", "mcp", "get", server.name]),
  );
  if (exists) {
    log(`MCP server ${server.name} already exists`);
    return;
  }
  log(`Adding MCP server ${server.name} (${server.url})`);
  await runCommandAsync(
    "sprite",
    spriteExecArguments(spriteName, [
      "claude",
      "mcp",
      "add",
      "--transport",
      "http",
      "--scope",
      "user",
      server.name,
      server.url,
    ]),
  );
}

async function authenticateMcpServers(options: SpriteSetupOptions): Promise<void> {
  if (options.mcpServers.length === 0 || !options.shouldAuthenticateMcp) {
    return;
  }

  writeOutput();
  writeOutput("Claude will open inside the sprite so you can authenticate only these MCP servers:");
  for (const server of options.mcpServers) {
    writeOutput(`  - ${server.name}`);
  }
  writeOutput(
    "Inside Claude, run /mcp, select each listed server, choose Authenticate, then /exit.",
  );
  writeOutput(
    "If the browser redirects to localhost and cannot connect, paste that callback URL into Claude when prompted.",
  );
  writeOutput();

  await runCommandAsync(
    "sprite",
    spriteTtyExecArguments(options.spriteName, ["claude", "--permission-mode", "auto"]),
    { stdio: "inherit", timeoutMs: 0 },
  );
}

async function checkpoint(options: SpriteSetupOptions): Promise<void> {
  if (!options.shouldCheckpoint) {
    return;
  }
  await runCommandAsync(
    "sprite",
    ["checkpoint", "create", "-s", options.spriteName, "--comment", options.checkpointComment],
    { stdio: "inherit", timeoutMs: 0 },
  );
}

function repositorySlug(options: SpriteBootstrapOptions): string {
  return options.repository.includes("/")
    ? options.repository
    : `${options.owner}/${options.repository}`;
}

function repositoryDirectoryName(repository: string): string {
  const name = repository.includes("/")
    ? repository.slice(repository.lastIndexOf("/") + 1)
    : repository;
  return name.endsWith(".git") ? name.slice(0, -4) : name;
}

function remoteBootstrapCommand(options: SpriteBootstrapOptions): string {
  const slug = repositorySlug(options);
  const directoryName = repositoryDirectoryName(options.repository);
  const unsetSecretsLine =
    options.secretNames.length === 0 ? ":" : `unset ${options.secretNames.join(" ")}`;
  const checkoutLines =
    options.branchName === undefined
      ? [
          `git checkout -B ${shellSingleQuote(options.baseBranch)} ${shellSingleQuote(`origin/${options.baseBranch}`)}`,
        ]
      : [
          `if git show-ref --verify --quiet ${shellSingleQuote(`refs/remotes/origin/${options.branchName}`)}; then`,
          `  git checkout -B ${shellSingleQuote(options.branchName)} ${shellSingleQuote(`origin/${options.branchName}`)}`,
          "else",
          `  git checkout -B ${shellSingleQuote(options.branchName)} ${shellSingleQuote(`origin/${options.baseBranch}`)}`,
          "fi",
        ];

  return [
    "set -euo pipefail",
    `cleanup() { rm -f ${shellSingleQuote(REMOTE_SECRETS_FILE)}; ${unsetSecretsLine}; }`,
    "trap cleanup EXIT",
    'mkdir -p "$HOME/dev"',
    `repo_dir="$HOME/dev/${directoryName}"`,
    'if [ ! -d "$repo_dir/.git" ]; then',
    `  gh repo clone ${shellSingleQuote(slug)} "$repo_dir"`,
    "fi",
    'cd "$repo_dir"',
    "git fetch origin --prune",
    ...checkoutLines,
    `if [ -f ${shellSingleQuote(REMOTE_SECRETS_FILE)} ]; then set -a && . ${shellSingleQuote(REMOTE_SECRETS_FILE)} && set +a; fi`,
    DEFAULT_SANDBOX_SETUP_COMMAND,
  ].join("\n");
}

interface StagedSecrets {
  filePath: string | undefined;
  names: string[];
  cleanup(): void;
}

function noSecretCleanup(): void {
  // No staged secrets file was created.
}

function stageBuildSecrets(options: SpriteBootstrapOptions): StagedSecrets {
  if (!options.shouldUseSecrets || options.secretNames.length === 0) {
    return { filePath: undefined, names: [], cleanup: noSecretCleanup };
  }

  const lines: string[] = [];
  const names: string[] = [];
  for (const name of options.secretNames) {
    const value = readEnvironmentVariable(name);
    if (value === undefined || value.length === 0) {
      if (options.shouldRequireSelectedSecrets) {
        throw new Error(`${name} is not set in the local environment.`);
      }
      continue;
    }
    lines.push(`${name}=${shellSingleQuote(value)}`);
    names.push(name);
  }
  if (lines.length === 0) {
    return { filePath: undefined, names, cleanup: noSecretCleanup };
  }

  const directory = mkdtempSync(join(tmpdir(), "groundcrew-sprite-secrets-"));
  const filePath = join(directory, "secrets.env");
  writeFileSync(filePath, `${lines.join("\n")}\n`, { mode: 0o600 });
  return {
    filePath,
    names,
    cleanup() {
      rmSync(directory, { recursive: true, force: true });
    },
  };
}

export async function bootstrapSpriteRepository(options: SpriteBootstrapOptions): Promise<void> {
  if (!(await spriteExists(options.spriteName))) {
    throw new Error(`Sprite ${options.spriteName} does not exist. Run crew sprite setup first.`);
  }

  const stagedSecrets = stageBuildSecrets(options);
  try {
    if (stagedSecrets.names.length > 0) {
      log(`Forwarding build secret names for setup only: ${stagedSecrets.names.join(", ")}`);
    }
    const spriteArguments = ["exec", "-s", options.spriteName];
    if (stagedSecrets.filePath !== undefined) {
      spriteArguments.push("--file", `${stagedSecrets.filePath}:${REMOTE_SECRETS_FILE}`);
    }
    spriteArguments.push("--", "bash", "-lc", remoteBootstrapCommand(options));

    log(`Bootstrapping ${repositorySlug(options)} in ${options.spriteName}`);
    await runCommandAsync("sprite", spriteArguments, { stdio: "inherit", timeoutMs: 0 });
  } finally {
    stagedSecrets.cleanup();
  }
}

async function resolveSpriteName(spriteName: string | undefined): Promise<string> {
  if (spriteName !== undefined) {
    return spriteName;
  }
  const config = await loadConfig();
  return config.remote.sprite.spriteName;
}

export async function listSpriteSessions(options: SpriteSessionsOptions): Promise<void> {
  const spriteName = await resolveSpriteName(options.spriteName);
  await runCommandAsync("sprite", ["sessions", "list", "-s", spriteName], { stdio: "inherit" });
}

export async function attachSpriteSession(options: SpriteAttachOptions): Promise<void> {
  const spriteName = await resolveSpriteName(options.spriteName);
  await runCommandAsync("sprite", ["attach", "-s", spriteName, options.target], {
    stdio: "inherit",
    timeoutMs: 0,
  });
}

export async function setupSprite(options: SpriteSetupOptions): Promise<void> {
  await ensureSprite(options);
  await prepareHome(options.spriteName);
  await configureGit(options);

  if (options.shouldAuthenticateGithub) {
    await authenticateGithub(options.spriteName);
  }
  if (options.shouldAuthenticateClaude) {
    await authenticateClaude(options.spriteName);
  }
  if (options.shouldAuthenticateCodex) {
    await authenticateCodex(options.spriteName, options.shouldCopyLocalCodexAuth === true);
  }

  for (const server of options.mcpServers) {
    // oxlint-disable-next-line no-await-in-loop -- MCP additions are sequential so auth instructions stay ordered.
    await addMcpServer(options.spriteName, server);
  }
  await authenticateMcpServers(options);
  await checkpoint(options);

  log(`Sprite ${options.spriteName} setup complete`);
}

export async function spriteCli(argv: string[]): Promise<void> {
  const [action, ...rest] = argv;
  if (action === "setup") {
    await setupSprite(parseArguments(rest));
    return;
  }
  if (action === "bootstrap") {
    await bootstrapSpriteRepository(parseBootstrapArguments(rest));
    return;
  }
  if (action === "sessions") {
    await listSpriteSessions(parseSessionsArguments(rest));
    return;
  }
  if (action === "attach") {
    await attachSpriteSession(parseAttachArguments(rest));
    return;
  }
  throw new Error(usage());
}
