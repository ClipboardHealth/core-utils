import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { BUILD_SECRET_NAMES } from "./buildSecrets.ts";
import { SPRITE_REMOTE_PROVIDER_DEFAULTS } from "./spriteRemoteRunnerProvider.ts";
import { log, readEnvironmentVariable, setLogFile } from "./util.ts";

export { BUILD_SECRET_NAMES } from "./buildSecrets.ts";
export { DEFAULT_REMOTE_SETUP_COMMAND } from "./remoteSetupCommand.ts";

/**
 * Reserved model name. A ticket labeled `agent-any` resolves at runtime
 * to the configured model with the most available session capacity, so
 * `any` cannot itself be a model. orchestrator.ts imports this constant
 * so the reserved name lives in one place.
 */
export const AGENT_ANY_MODEL = "any";

export type WorkspaceRunner = "local" | "remote";

export const WORKSPACE_RUNNERS: readonly WorkspaceRunner[] = ["local", "remote"] as const;

export const REMOTE_RUNNER_PROVIDER_NAMES = ["sprite"] as const;

export type RemoteRunnerProviderName = (typeof REMOTE_RUNNER_PROVIDER_NAMES)[number];

export function isRemoteRunnerProviderName(value: unknown): value is RemoteRunnerProviderName {
  return (
    typeof value === "string" && (REMOTE_RUNNER_PROVIDER_NAMES as readonly string[]).includes(value)
  );
}

/**
 * Which terminal session manager hosts the agent process:
 *
 * - `auto`: pick the first available — cmux on macOS when installed,
 *   else tmux.
 * - `cmux`: require the cmux binary; fail loudly if missing.
 * - `tmux`: require the tmux binary; fail loudly if missing.
 */
export type WorkspaceKindSetting = "auto" | "cmux" | "tmux";

export const WORKSPACE_KIND_SETTINGS: readonly WorkspaceKindSetting[] = [
  "auto",
  "cmux",
  "tmux",
] as const;

export interface ModelDefinition {
  /**
   * Shell command launched for the model. For local runs this is wrapped
   * with Safehouse/clearance; for remote runs it executes inside the remote
   * runner workspace. The rendered prompt is appended as a single quoted
   * positional argument. `{{worktree}}` is replaced before launch.
   *
   * Keep this agent-native (e.g., `claude --permission-mode bypassPermissions`).
   * Groundcrew adds the Safehouse wrapper for local runs.
   */
  cmd: string;
  color: string;
  usage?: {
    codexbar: { provider: string; source?: string };
  };
}

export interface RemoteRunnerConfig {
  provider: RemoteRunnerProviderName;
  runnerName: string;
  owner: string;
  repoRoot: string;
  worktreeRoot: string;
  secretNames: string[];
}

type UserModelDefinition = Partial<ModelDefinition> & { disabled?: boolean };

/**
 * Setup command run inside sibling worktrees on the host. The host is
 * assumed to already have the right Node and npm versions, so this skips
 * the `n`/global-npm bootstrap that the remote setup command does.
 */
export const DEFAULT_HOST_SETUP_COMMAND =
  "if [ -x .claude/setup.sh ]; then ./.claude/setup.sh --deps-only; elif [ -f .claude/setup.sh ] && command -v bash >/dev/null 2>&1; then bash .claude/setup.sh --deps-only; else npm clean-install; fi";

/**
 * Loose user-facing shape — what a `config.ts` file declares.
 * Fields with defaults are optional; only `linear.projectSlug` and the
 * `workspace.*` fields are required.
 */
export interface Config {
  linear: {
    /**
     * Project URL slug as it appears in Linear's URL bar — e.g.
     * `ai-strategy-5152195762f3` from
     * `https://linear.app/<workspace>/project/ai-strategy-5152195762f3`.
     * The trailing 12-character hex `slugId` is what's used for the
     * GraphQL filter; the leading name segment is kept intact in the
     * config so `config.ts` is self-documenting at a glance, and so it
     * survives Linear project renames.
     */
    projectSlug: string;
    statuses?: {
      todo?: string;
      inProgress?: string;
      done?: string;
      terminal?: string[];
    };
  };
  git?: {
    remote?: string;
    defaultBranch?: string;
  };
  workspace: {
    projectDir: string;
    knownRepositories: string[];
  };
  orchestrator?: {
    maximumInProgress?: number;
    pollIntervalMilliseconds?: number;
    sessionLimitPercentage?: number;
  };
  models?: {
    default?: string;
    /**
     * Additive: each entry merges over the shipped default for that key.
     * Override `claude.cmd` only by declaring `{ claude: { cmd: "..." } }` —
     * the other fields stay at their default values. Brand-new model
     * names must supply enough fields to satisfy `validate()`.
     */
    definitions?: Record<string, UserModelDefinition>;
  };
  prompts?: {
    initial?: string;
  };
  /**
   * Terminal session manager that hosts agent processes. Defaults to
   * `"auto"` — cmux on macOS when installed, else tmux. Set explicitly
   * to fail loudly when the chosen backend is missing.
   */
  workspaceKind?: WorkspaceKindSetting;
  remote?: Partial<RemoteRunnerConfig>;
  logging?: {
    /**
     * Append-mode log file destination. `log()` and `logEvent()` tee here
     * in addition to stdout, so a vanished workspace doesn't take the
     * evidence with it. Defaults to
     * `${XDG_STATE_HOME:-~/.local/state}/groundcrew/groundcrew.log`.
     */
    file?: string;
  };
}

/**
 * Strict shape after defaults are applied — what scripts work with.
 */
export interface ResolvedConfig {
  linear: {
    /** Original full slug from `Config.linear.projectSlug` — for log lines. */
    projectSlug: string;
    /** 12-char hex tail of `projectSlug` — the value Linear filters on. */
    slugId: string;
    statuses: {
      todo: string;
      inProgress: string;
      done: string;
      terminal: string[];
    };
  };
  git: {
    remote: string;
    defaultBranch: string;
  };
  workspace: {
    projectDir: string;
    knownRepositories: string[];
  };
  orchestrator: {
    maximumInProgress: number;
    pollIntervalMilliseconds: number;
    sessionLimitPercentage: number;
  };
  models: {
    default: string;
    definitions: Record<string, ModelDefinition>;
  };
  prompts: {
    initial: string;
  };
  /**
   * Terminal session manager. Always present — defaults to `"auto"`.
   * `auto` resolves to cmux on macOS when installed, else tmux.
   */
  workspaceKind: WorkspaceKindSetting;
  remote: RemoteRunnerConfig;
  logging: {
    file: string;
  };
}

const DEFAULT_STATUSES: ResolvedConfig["linear"]["statuses"] = {
  todo: "Todo",
  inProgress: "In Progress",
  done: "Done",
  terminal: ["Done"],
};

const DEFAULT_GIT: ResolvedConfig["git"] = {
  remote: "origin",
  defaultBranch: "main",
};

const DEFAULT_ORCHESTRATOR: ResolvedConfig["orchestrator"] = {
  maximumInProgress: 4,
  pollIntervalMilliseconds: 120_000,
  sessionLimitPercentage: 85,
};

const DEFAULT_MODEL_DEFINITIONS: Record<string, ModelDefinition> = {
  claude: {
    cmd: "claude --permission-mode bypassPermissions",
    color: "#C15F3C",
    usage: { codexbar: { provider: "claude" } },
  },
  codex: {
    cmd: "codex --dangerously-bypass-approvals-and-sandbox",
    color: "#3267e3",
    usage: { codexbar: { provider: "codex" } },
  },
};

const DEFAULT_PROMPT_INITIAL = [
  "Begin work on {{ticket}} ({{title}}) in the {{worktree}} wt subdirectory.",
  "",
  "Ticket description:",
  "",
  "{{description}}",
].join("\n");

const DEFAULT_REMOTE: ResolvedConfig["remote"] = {
  ...SPRITE_REMOTE_PROVIDER_DEFAULTS,
  secretNames: [...BUILD_SECRET_NAMES],
};

const ALLOWED_PROMPT_PLACEHOLDERS = new Set([
  "{{ticket}}",
  "{{worktree}}",
  "{{title}}",
  "{{description}}",
]);
const PROMPT_PLACEHOLDER_RE = /{{[^{}]*}}/g;

// import.meta.dirname is `<package>/src/lib`; the user's `config.ts` lives
// at the package root (gitignored), two levels up. Last-resort fallback
// when neither GROUNDCREW_CONFIG nor the XDG path resolves to a file.
const PACKAGE_CONFIG_PATH = resolve(import.meta.dirname, "..", "..", "config.ts");

const PERCENT_MIN_EXCLUSIVE = 0;
const PERCENT_MAX = 100;

function xdgBase(envName: string, fallbackSegments: readonly string[]): string {
  const override = readEnvironmentVariable(envName);
  if (override !== undefined && override.length > 0) {
    return override;
  }
  return resolve(homedir(), ...fallbackSegments);
}

function xdgConfigPath(...segments: string[]): string {
  return resolve(xdgBase("XDG_CONFIG_HOME", [".config"]), ...segments);
}

function xdgStatePath(...segments: string[]): string {
  return resolve(xdgBase("XDG_STATE_HOME", [".local", "state"]), ...segments);
}

function defaultLogFile(): string {
  return xdgStatePath("groundcrew", "groundcrew.log");
}

function resolveConfigPath(): string {
  const override = readEnvironmentVariable("GROUNDCREW_CONFIG");
  if (override !== undefined && override.length > 0) {
    return resolve(override);
  }
  const xdgPath = xdgConfigPath("groundcrew", "config.ts");
  if (existsSync(xdgPath)) {
    return xdgPath;
  }
  return PACKAGE_CONFIG_PATH;
}

function expandHome(p: string): string {
  if (p === "~") {
    return homedir();
  }
  if (p.startsWith("~/")) {
    return resolve(homedir(), p.slice(2));
  }
  return p;
}

function fail(message: string): never {
  throw new Error(`groundcrew config: ${message}`);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function requireString(value: unknown, path: string): asserts value is string {
  if (!isNonEmptyString(value)) {
    fail(`${path} must be a non-empty string (got ${JSON.stringify(value)})`);
  }
}

function requirePositiveInt(value: unknown, path: string, min = 1): asserts value is number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < min) {
    fail(`${path} must be an integer ≥ ${min} (got ${JSON.stringify(value)})`);
  }
}

function requirePercent(value: unknown, path: string): asserts value is number {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value <= PERCENT_MIN_EXCLUSIVE ||
    value > PERCENT_MAX
  ) {
    fail(`${path} must be a finite number in (0, 100] (got ${JSON.stringify(value)})`);
  }
}

function cloneModelDefinition(definition: ModelDefinition): ModelDefinition {
  return structuredClone(definition);
}

function normalizeOptionalString(value: unknown, path: string): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "string" || value.trim().length === 0) {
    fail(`${path} must be a non-empty string`);
  }
  return value.trim();
}

function normalizeOptionalStringArray(value: unknown, path: string): string[] | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!Array.isArray(value)) {
    fail(`${path} must be an array`);
  }
  return value.map((entry, index) => {
    if (typeof entry !== "string" || entry.trim().length === 0) {
      fail(`${path}[${index}] must be a non-empty string`);
    }
    return entry.trim();
  });
}

function uniqueStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    if (seen.has(value)) {
      continue;
    }
    seen.add(value);
    out.push(value);
  }
  return out;
}

function normalizeStatusName(value: unknown, fallback: string, path: string): string {
  return normalizeOptionalString(value, path) ?? fallback;
}

function normalizeStatuses(
  user: Config["linear"]["statuses"],
): ResolvedConfig["linear"]["statuses"] {
  const todo = normalizeStatusName(user?.todo, DEFAULT_STATUSES.todo, "linear.statuses.todo");
  const inProgress = normalizeStatusName(
    user?.inProgress,
    DEFAULT_STATUSES.inProgress,
    "linear.statuses.inProgress",
  );
  const done = normalizeStatusName(user?.done, DEFAULT_STATUSES.done, "linear.statuses.done");
  const terminal = normalizeOptionalStringArray(user?.terminal, "linear.statuses.terminal") ?? [];
  return {
    todo,
    inProgress,
    done,
    terminal: uniqueStrings([...terminal, done]),
  };
}

function normalizeSecretNames(value: unknown, path: string): string[] | undefined {
  const names = normalizeOptionalStringArray(value, path);
  if (names === undefined) {
    return undefined;
  }
  names.forEach((name, index) => {
    if (!/^[A-Z_][A-Z0-9_]*$/.test(name)) {
      fail(`${path}[${index}] must be a valid environment variable name`);
    }
  });
  return names;
}

function normalizeRemoteProvider(value: unknown): RemoteRunnerProviderName | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!isRemoteRunnerProviderName(value)) {
    fail(`remote.provider must be "sprite" (got ${JSON.stringify(value)})`);
  }
  return value;
}

function normalizeRemoteRunnerConfig(user: Config["remote"] | undefined): ResolvedConfig["remote"] {
  if (isPlainObject(user) && Object.hasOwn(user, "sprite")) {
    fail(
      "remote.sprite is no longer supported: use remote.provider, remote.runnerName, remote.owner, remote.repoRoot, remote.worktreeRoot, and remote.secretNames",
    );
  }
  const provider = normalizeRemoteProvider(user?.provider) ?? DEFAULT_REMOTE.provider;
  return {
    provider,
    runnerName:
      normalizeOptionalString(user?.runnerName, "remote.runnerName") ?? DEFAULT_REMOTE.runnerName,
    owner: normalizeOptionalString(user?.owner, "remote.owner") ?? DEFAULT_REMOTE.owner,
    repoRoot: normalizeOptionalString(user?.repoRoot, "remote.repoRoot") ?? DEFAULT_REMOTE.repoRoot,
    worktreeRoot:
      normalizeOptionalString(user?.worktreeRoot, "remote.worktreeRoot") ??
      DEFAULT_REMOTE.worktreeRoot,
    secretNames: [
      ...(normalizeSecretNames(user?.secretNames, "remote.secretNames") ??
        DEFAULT_REMOTE.secretNames),
    ],
  };
}

function isWorkspaceKindSetting(value: unknown): value is WorkspaceKindSetting {
  return (
    typeof value === "string" && (WORKSPACE_KIND_SETTINGS as readonly string[]).includes(value)
  );
}

function normalizeWorkspaceKind(value: unknown, path: string): WorkspaceKindSetting | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!isWorkspaceKindSetting(value)) {
    fail(
      `${path} must be one of ${WORKSPACE_KIND_SETTINGS.join(", ")} (got ${JSON.stringify(value)})`,
    );
  }
  return value;
}

function failIfLegacyModelKeys(
  name: string,
  override: unknown,
): asserts override is UserModelDefinition {
  if (!isPlainObject(override)) {
    fail(`models.definitions.${name} must be an object`);
  }
  if (Object.hasOwn(override, "isolation")) {
    fail(
      `models.definitions.${name}.isolation is no longer supported: per-model isolation is no longer supported`,
    );
  }
  if (Object.hasOwn(override, "sandbox")) {
    fail(
      `models.definitions.${name}.sandbox is no longer supported: Docker Sandboxes are no longer supported`,
    );
  }
  if (Object.hasOwn(override, "disabled")) {
    if (override["disabled"] !== true) {
      fail(
        `models.definitions.${name}.disabled must be exactly \`true\` when set (got ${JSON.stringify(override["disabled"])})`,
      );
    }
    const conflicting = (["cmd", "color", "usage"] as const).filter((key) =>
      Object.hasOwn(override, key),
    );
    if (conflicting.length > 0) {
      fail(
        `models.definitions.${name}: cannot combine \`disabled: true\` with other fields (${conflicting.join(", ")}). Either disable the model or override its fields, not both.`,
      );
    }
  }
}

function mergeDefinitions(
  user: Record<string, UserModelDefinition> | undefined,
): Record<string, ModelDefinition> {
  if (user !== undefined && !isPlainObject(user)) {
    fail("models.definitions must be an object");
  }
  const merged: Record<string, ModelDefinition> = Object.fromEntries(
    Object.entries(DEFAULT_MODEL_DEFINITIONS).map(([name, definition]) => [
      name,
      cloneModelDefinition(definition),
    ]),
  );
  for (const [name, override] of Object.entries(user ?? {})) {
    failIfLegacyModelKeys(name, override);

    if (override.disabled === true) {
      if (!Object.hasOwn(DEFAULT_MODEL_DEFINITIONS, name)) {
        fail(
          `models.definitions.${name}: \`disabled: true\` is only valid for shipped defaults (${Object.keys(DEFAULT_MODEL_DEFINITIONS).join(", ")}). Remove the entry instead.`,
        );
      }
      // oxlint-disable-next-line typescript/no-dynamic-delete -- `merged` is a fresh, function-local clone of DEFAULT_MODEL_DEFINITIONS, so V8 dictionary-mode concerns don't apply.
      delete merged[name];
      continue;
    }

    const base: Partial<ModelDefinition> =
      merged[name] === undefined ? {} : cloneModelDefinition(merged[name]);
    // Per-key spread so overriding `cmd` alone preserves the default
    // `color` / `usage`. Brand-new entries must supply both required fields.
    const candidate: Partial<ModelDefinition> = { ...base };
    if (override.cmd !== undefined) {
      candidate.cmd = override.cmd;
    }
    if (override.color !== undefined) {
      candidate.color = override.color;
    }
    if (override.usage !== undefined) {
      candidate.usage = override.usage;
    }
    const { cmd, color, usage } = candidate;
    if (typeof cmd !== "string" || cmd.length === 0) {
      fail(`models.definitions.${name}.cmd must be a non-empty string`);
    }
    if (typeof color !== "string" || color.length === 0) {
      fail(`models.definitions.${name}.color must be a non-empty string`);
    }
    const definition: ModelDefinition = { cmd, color };
    if (usage !== undefined) {
      definition.usage = usage;
    }
    merged[name] = definition;
  }
  return merged;
}

// Linear project URL slugs end with a 12-char lowercase hex `slugId`.
const SLUG_ID_RE = /-([\da-f]{12})$/i;

function extractSlugId(slug: string): string | undefined {
  return SLUG_ID_RE.exec(slug)?.[1]?.toLowerCase();
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireObject(value: unknown, path: string): void {
  if (!isPlainObject(value)) {
    fail(`${path} must be an object (got ${JSON.stringify(value)})`);
  }
}

function applyDefaults(user: Config): ResolvedConfig {
  // Guard the top-level shape before reading nested fields, so a
  // malformed runtime config produces a `groundcrew config: ...` error
  // instead of a raw `TypeError: Cannot read properties of undefined`.
  requireObject(user.linear, "linear");
  requireString(user.linear.projectSlug, "linear.projectSlug");
  requireObject(user.workspace, "workspace");
  if (isPlainObject(user.models) && Object.hasOwn(user.models, "isolation")) {
    fail(
      "models.isolation is no longer supported: local isolation is always Safehouse; remove this key",
    );
  }

  const slugId = extractSlugId(user.linear.projectSlug);
  if (slugId === undefined) {
    fail(
      `linear.projectSlug must end with a 12-character hex slugId (got ${JSON.stringify(user.linear.projectSlug)}). Copy the trailing segment from your Linear project URL, e.g. "ai-strategy-5152195762f3" from "https://linear.app/<workspace>/project/ai-strategy-5152195762f3".`,
    );
  }
  return {
    linear: {
      projectSlug: user.linear.projectSlug,
      slugId,
      statuses: normalizeStatuses(user.linear.statuses),
    },
    git: { ...DEFAULT_GIT, ...user.git },
    workspace: {
      projectDir: expandHome(user.workspace.projectDir),
      knownRepositories: user.workspace.knownRepositories,
    },
    orchestrator: { ...DEFAULT_ORCHESTRATOR, ...user.orchestrator },
    models: {
      default: user.models?.default ?? "claude",
      definitions: mergeDefinitions(user.models?.definitions),
    },
    prompts: {
      initial: user.prompts?.initial ?? DEFAULT_PROMPT_INITIAL,
    },
    workspaceKind: normalizeWorkspaceKind(user.workspaceKind, "workspaceKind") ?? "auto",
    remote: normalizeRemoteRunnerConfig(user.remote),
    logging: {
      file: expandHome(
        normalizeOptionalString(user.logging?.file, "logging.file") ?? defaultLogFile(),
      ),
    },
  };
}

function validatePromptPlaceholders(template: string): void {
  const placeholders = template.match(PROMPT_PLACEHOLDER_RE) ?? [];
  const unknown = placeholders.find((placeholder) => !ALLOWED_PROMPT_PLACEHOLDERS.has(placeholder));
  if (unknown !== undefined) {
    fail(
      `prompts.initial contains unknown placeholder ${JSON.stringify(unknown)}. Allowed placeholders: ${[...ALLOWED_PROMPT_PLACEHOLDERS].join(", ")}`,
    );
  }
}

function validate(config: ResolvedConfig): void {
  requireString(config.linear.projectSlug, "linear.projectSlug");
  requireString(config.linear.slugId, "linear.slugId");
  requireString(config.linear.statuses.todo, "linear.statuses.todo");
  requireString(config.linear.statuses.inProgress, "linear.statuses.inProgress");
  requireString(config.linear.statuses.done, "linear.statuses.done");
  config.linear.statuses.terminal.forEach((status, index) => {
    requireString(status, `linear.statuses.terminal[${index}]`);
  });

  requireString(config.git.remote, "git.remote");
  requireString(config.git.defaultBranch, "git.defaultBranch");

  requireString(config.workspace.projectDir, "workspace.projectDir");

  if (
    !Array.isArray(config.workspace.knownRepositories) ||
    config.workspace.knownRepositories.length === 0
  ) {
    fail("workspace.knownRepositories must be a non-empty array");
  }
  config.workspace.knownRepositories.forEach((repository, index) => {
    requireString(repository, `workspace.knownRepositories[${index}]`);
  });

  requirePositiveInt(config.orchestrator.maximumInProgress, "orchestrator.maximumInProgress");
  requirePositiveInt(
    config.orchestrator.pollIntervalMilliseconds,
    "orchestrator.pollIntervalMilliseconds",
  );

  requirePercent(config.orchestrator.sessionLimitPercentage, "orchestrator.sessionLimitPercentage");

  const { definitions } = config.models;
  /* v8 ignore next 3 @preserve -- mergeDefinitions seeds claude+codex defaults, so an empty map is unreachable */
  if (Object.keys(definitions).length === 0) {
    fail("models.definitions must contain at least one model");
  }
  if (AGENT_ANY_MODEL in definitions) {
    fail(
      `models.definitions cannot contain "${AGENT_ANY_MODEL}" — it is reserved for the agent-any label, which routes to the model with the most available session capacity`,
    );
  }
  for (const [name, definition] of Object.entries(definitions)) {
    requireString(definition.cmd, `models.definitions.${name}.cmd`);
    requireString(definition.color, `models.definitions.${name}.color`);
    if (definition.usage !== undefined) {
      const usagePath = `models.definitions.${name}.usage`;
      if (typeof definition.usage !== "object" || definition.usage === null) {
        fail(`${usagePath} must be an object`);
      }
      const { codexbar } = definition.usage;
      if (typeof codexbar !== "object" || codexbar === null) {
        fail(`${usagePath}.codexbar must be an object`);
      }
      requireString(codexbar.provider, `${usagePath}.codexbar.provider`);
    }
  }

  if (!(config.models.default in definitions)) {
    fail(
      `models.default ("${config.models.default}") is not a key in models.definitions (have: ${Object.keys(definitions).join(", ")})`,
    );
  }

  requireString(config.prompts.initial, "prompts.initial");
  validatePromptPlaceholders(config.prompts.initial);

  /* v8 ignore next 3 @preserve -- normalizeRemoteProvider rejects this before validate() runs */
  if (config.remote.provider !== "sprite") {
    fail(`remote.provider must be "sprite" (got ${JSON.stringify(config.remote.provider)})`);
  }
  requireString(config.remote.runnerName, "remote.runnerName");
  requireString(config.remote.owner, "remote.owner");
  requireString(config.remote.repoRoot, "remote.repoRoot");
  requireString(config.remote.worktreeRoot, "remote.worktreeRoot");
  config.remote.secretNames.forEach((name, index) => {
    requireString(name, `remote.secretNames[${index}]`);
    /* v8 ignore next 3 @preserve -- normalizeSecretNames already enforces this before validate() runs */
    if (!/^[A-Z_][A-Z0-9_]*$/.test(name)) {
      fail(`remote.secretNames[${index}] must be a valid environment variable name`);
    }
  });

  requireString(config.logging.file, "logging.file");
}

let cached: Readonly<ResolvedConfig> | undefined;

export async function loadConfig(): Promise<Readonly<ResolvedConfig>> {
  if (cached) {
    return cached;
  }

  const path = resolveConfigPath();
  if (!existsSync(path)) {
    fail(
      `${path} not found. Copy configExample.ts to ${xdgConfigPath("groundcrew", "config.ts")} (or set GROUNDCREW_CONFIG to a different path) and edit it.`,
    );
  }
  log(`Loaded config from ${path}`);

  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- user config is TS-typed against Config; runtime fields are validated below
  const module_ = (await import(pathToFileURL(path).href)) as { config?: Config };
  const { config: userConfig } = module_;
  if (!userConfig) {
    fail(
      `${path} must export a named "config" object (e.g. \`export const config: Config = { ... }\`)`,
    );
  }

  const resolved = applyDefaults(userConfig);

  validate(resolved);

  setLogFile(resolved.logging.file);

  cached = Object.freeze(resolved);
  return cached;
}
