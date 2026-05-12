import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { readEnvironmentVariable } from "./util.ts";

/**
 * Reserved model name. A ticket labeled `agent-any` resolves at runtime
 * to the configured model with the most available session capacity, so
 * `any` cannot itself be a model. orchestrator.ts imports this constant
 * so the reserved name lives in one place.
 */
export const AGENT_ANY_MODEL = "any";

/**
 * How a model's launch command is wrapped before it runs:
 *
 * - `auto`: pick the first available — safehouse on a supported host with
 *   the binary installed, else Docker Sandboxes when configured. Fails if
 *   no isolated runner is available.
 * - `safehouse`: require the safehouse binary on a supported host; fail
 *   loudly if missing.
 * - `docker`: require the model's `sandbox` config and the `sbx` binary;
 *   fail loudly if missing.
 * - `none`: run the agent command directly with no wrapper.
 */
export type IsolationStrategy = "auto" | "safehouse" | "docker" | "none";

export const ISOLATION_STRATEGIES: readonly IsolationStrategy[] = [
  "auto",
  "safehouse",
  "docker",
  "none",
] as const;

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

export interface SandboxDefinition {
  /**
   * Docker Sandboxes agent/template name used to create the persistent
   * repo/model sandbox. Examples: `claude`, `codex`.
   */
  agent: string;
  /**
   * Optional Docker Sandboxes template image used when creating the
   * persistent sandbox. Existing sandboxes keep their current template.
   */
  template?: string;
  /**
   * Optional Docker Sandboxes kits applied when creating the persistent
   * sandbox. Existing sandboxes keep their current kits.
   */
  kits?: string[];
  /**
   * Shell command run inside each sbx branch worktree before the agent
   * command. Defaults to syncing a simple `.nvmrc` Node version, honoring
   * `package.json` npm engines, then running `.claude/setup.sh --deps-only`
   * when present, falling back to `npm clean-install`.
   */
  setupCommand?: string;
}

export interface ModelDefinition {
  /**
   * Shell command launched for the model. For sandbox-backed models this
   * runs inside the persistent Docker sandbox; otherwise it runs in the
   * workspace. The rendered prompt is appended as a single quoted
   * positional argument. `{{worktree}}` and `{{sandbox}}` placeholders are
   * replaced before launch.
   *
   * Keep this agent-native (e.g., `claude --permission-mode auto`).
   * The isolation strategy adds wrappers like `safehouse` or `sbx exec`.
   */
  cmd: string;
  color: string;
  sandbox?: SandboxDefinition;
  /**
   * Per-model override of `models.isolation`. When unset, falls back to
   * the global setting.
   */
  isolation?: IsolationStrategy;
  usage?: {
    codexbar: { provider: string; source?: string };
  };
}

type UserModelDefinition = Omit<Partial<ModelDefinition>, "sandbox"> & {
  /**
   * `false` disables sandbox mode for a shipped default model while keeping
   * per-key override behavior for fields like color/usage.
   */
  sandbox?: false | Partial<SandboxDefinition>;
};

export const DEFAULT_SANDBOX_SETUP_COMMAND = [
  [
    "if [ -f .nvmrc ]; then",
    "required_node=$(tr -d '[:space:]' < .nvmrc | sed 's/^v//')",
    'current_node=$(node --version 2>/dev/null | sed "s/^v//")',
    'if [ -n "$required_node" ] && [ "$current_node" != "$required_node" ]; then',
    "npm install --global n --no-audit --no-fund",
    "n_path=$(command -v n)",
    'sudo "$n_path" "$required_node"',
    "hash -r",
    "fi",
    "fi",
  ].join("; "),
  "required_npm=$(node -e \"try { console.log(require('./package.json').engines?.npm ?? '') } catch { console.log('') }\")",
  'if [ -n "$required_npm" ]; then npm install --global "npm@$required_npm" --no-audit --no-fund && hash -r; fi',
  "if [ -x .claude/setup.sh ]; then ./.claude/setup.sh --deps-only; elif [ -f .claude/setup.sh ] && command -v bash >/dev/null 2>&1; then bash .claude/setup.sh --deps-only; else npm clean-install; fi",
].join(" && ");

/**
 * Setup command run inside sibling worktrees on the host (safehouse and
 * none strategies). The host is assumed to already have the right Node
 * and npm versions, so this skips the `n`/global-npm bootstrap that the
 * Docker setup command does.
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
     * Global isolation strategy applied to every model unless the model
     * declares its own `isolation`. Defaults to `"auto"`, which picks
     * safehouse when installed on a supported host, else Docker
     * Sandboxes when configured. If neither isolated runner is available,
     * setup fails; set `"none"` explicitly to run directly.
     */
    isolation?: IsolationStrategy;
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
    /**
     * Global default isolation strategy. Per-model overrides win over
     * this. Always present — defaults to `"auto"`.
     */
    isolation: IsolationStrategy;
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
    cmd: "claude --permission-mode auto",
    color: "#C15F3C",
    sandbox: { agent: "claude" },
    usage: { codexbar: { provider: "claude" } },
  },
  codex: {
    cmd: "codex --dangerously-bypass-approvals-and-sandbox",
    color: "#3267e3",
    sandbox: { agent: "codex" },
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

const ALLOWED_PROMPT_PLACEHOLDERS = new Set([
  "{{ticket}}",
  "{{worktree}}",
  "{{title}}",
  "{{description}}",
]);
const PROMPT_PLACEHOLDER_RE = /{{[^{}]*}}/g;

// import.meta.dirname is `<package>/src/lib`; the user's `config.ts` lives
// at the package root (gitignored), two levels up.
const DEFAULT_CONFIG_PATH = resolve(import.meta.dirname, "..", "..", "config.ts");

const PERCENT_MIN_EXCLUSIVE = 0;
const PERCENT_MAX = 100;

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

function normalizeSandboxDefinition(
  name: string,
  sandbox: Partial<SandboxDefinition>,
): SandboxDefinition {
  if (typeof sandbox.agent !== "string" || sandbox.agent.trim().length === 0) {
    fail(`models.definitions.${name}.sandbox.agent must be a non-empty string`);
  }

  const definition: SandboxDefinition = { agent: sandbox.agent.trim() };
  const template = normalizeOptionalString(
    sandbox.template,
    `models.definitions.${name}.sandbox.template`,
  );
  if (template !== undefined) {
    definition.template = template;
  }

  const kits = normalizeOptionalStringArray(
    sandbox.kits,
    `models.definitions.${name}.sandbox.kits`,
  );
  if (kits !== undefined) {
    definition.kits = kits;
  }

  const setupCommand = normalizeOptionalString(
    sandbox.setupCommand,
    `models.definitions.${name}.sandbox.setupCommand`,
  );
  if (setupCommand !== undefined) {
    definition.setupCommand = setupCommand;
  }

  return definition;
}

function mergeSandboxDefinition(arguments_: {
  name: string;
  override: false | Partial<SandboxDefinition> | undefined;
  base: SandboxDefinition | undefined;
}): SandboxDefinition | undefined {
  if (arguments_.override === false) {
    return undefined;
  }
  if (arguments_.override === undefined) {
    return arguments_.base;
  }

  const agent = arguments_.override.agent ?? arguments_.base?.agent;
  if (agent === undefined) {
    fail(`models.definitions.${arguments_.name}.sandbox.agent must be a non-empty string`);
  }

  const sandbox: Partial<SandboxDefinition> = { agent };
  const template = arguments_.override.template ?? arguments_.base?.template;
  if (template !== undefined) {
    sandbox.template = template;
  }
  const kits = arguments_.override.kits ?? arguments_.base?.kits;
  if (kits !== undefined) {
    sandbox.kits = kits;
  }
  const setupCommand = arguments_.override.setupCommand ?? arguments_.base?.setupCommand;
  if (setupCommand !== undefined) {
    sandbox.setupCommand = setupCommand;
  }
  return normalizeSandboxDefinition(arguments_.name, sandbox);
}

function isIsolationStrategy(value: unknown): value is IsolationStrategy {
  return typeof value === "string" && (ISOLATION_STRATEGIES as readonly string[]).includes(value);
}

function normalizeIsolation(value: unknown, path: string): IsolationStrategy | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!isIsolationStrategy(value)) {
    fail(
      `${path} must be one of ${ISOLATION_STRATEGIES.join(", ")} (got ${JSON.stringify(value)})`,
    );
  }
  return value;
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

function mergeDefinitions(
  user: Record<string, UserModelDefinition> | undefined,
): Record<string, ModelDefinition> {
  const merged: Record<string, ModelDefinition> = Object.fromEntries(
    Object.entries(DEFAULT_MODEL_DEFINITIONS).map(([name, definition]) => [
      name,
      cloneModelDefinition(definition),
    ]),
  );
  for (const [name, override] of Object.entries(user ?? {})) {
    const base: Partial<ModelDefinition> =
      merged[name] === undefined ? {} : cloneModelDefinition(merged[name]);
    const { sandbox: baseSandbox } = base;
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
    const isolation = normalizeIsolation(
      override.isolation ?? base.isolation,
      `models.definitions.${name}.isolation`,
    );
    const sandbox = mergeSandboxDefinition({
      name,
      override: override.sandbox,
      base: baseSandbox,
    });
    const { cmd, color, usage } = candidate;
    if (typeof cmd !== "string" || cmd.length === 0) {
      fail(`models.definitions.${name}.cmd must be a non-empty string`);
    }
    if (typeof color !== "string" || color.length === 0) {
      fail(`models.definitions.${name}.color must be a non-empty string`);
    }
    const definition: ModelDefinition = { cmd, color };
    if (sandbox !== undefined) {
      definition.sandbox = sandbox;
    }
    if (isolation !== undefined) {
      definition.isolation = isolation;
    }
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
      projectDir: user.workspace.projectDir,
      knownRepositories: user.workspace.knownRepositories,
    },
    orchestrator: { ...DEFAULT_ORCHESTRATOR, ...user.orchestrator },
    models: {
      default: user.models?.default ?? "claude",
      isolation: normalizeIsolation(user.models?.isolation, "models.isolation") ?? "auto",
      definitions: mergeDefinitions(user.models?.definitions),
    },
    prompts: {
      initial: user.prompts?.initial ?? DEFAULT_PROMPT_INITIAL,
    },
    workspaceKind: normalizeWorkspaceKind(user.workspaceKind, "workspaceKind") ?? "auto",
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
}

let cached: Readonly<ResolvedConfig> | undefined;

export async function loadConfig(): Promise<Readonly<ResolvedConfig>> {
  if (cached) {
    return cached;
  }

  const path = resolve(readEnvironmentVariable("GROUNDCREW_CONFIG") ?? DEFAULT_CONFIG_PATH);
  if (!existsSync(path)) {
    fail(
      `${path} not found. Copy configExample.ts to config.ts and edit it (or set GROUNDCREW_CONFIG to a different path).`,
    );
  }

  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- user config is TS-typed against Config; runtime fields are validated below
  const module_ = (await import(pathToFileURL(path).href)) as { config?: Config };
  const { config: userConfig } = module_;
  if (!userConfig) {
    fail(
      `${path} must export a named "config" object (e.g. \`export const config: Config = { ... }\`)`,
    );
  }

  const resolved = applyDefaults(userConfig);

  const projectDirOverride = readEnvironmentVariable("PROJECT_DIR");
  resolved.workspace.projectDir = expandHome(
    projectDirOverride !== undefined && projectDirOverride.length > 0
      ? projectDirOverride
      : resolved.workspace.projectDir,
  );

  validate(resolved);

  cached = Object.freeze(resolved);
  return cached;
}
