import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

export const SAFEHOUSE_CMUX_ENV_PASS = [
  "CMUX_BUNDLED_CLI_PATH",
  "CMUX_CLAUDE_HOOKS_DISABLED",
  "CMUX_CLAUDE_WRAPPER_SHIM",
  "CMUX_CLAUDE_WRAPPER_SHIM_ROOT",
  "CMUX_CUSTOM_CLAUDE_PATH",
  "CMUX_PANEL_ID",
  "CMUX_PRESERVE_CLAUDE_AUTH_SELECTION_ENV",
  "CMUX_PRESERVE_CLAUDE_AUTH_SELECTION_ENV_KEYS",
  "CMUX_SOCKET_PATH",
  "CMUX_SUPPRESS_SUBAGENT_NOTIFICATIONS",
  "CMUX_SURFACE_ID",
  "CMUX_TAB_ID",
  "CMUX_WORKSPACE_ID",
] as const;

export const SAFEHOUSE_CMUX_WRAPPER_LOCAL_ENV_NAMES = [
  "CMUX_AGENT_LAUNCH_ARGV_B64",
  "CMUX_AGENT_LAUNCH_CWD",
  "CMUX_AGENT_LAUNCH_EXECUTABLE",
  "CMUX_AGENT_LAUNCH_KIND",
  // App-minted one-shot token authorizing a cmux-owned session restore. A
  // safehouse launch is never one, and the wrapper consumes it and re-issues it
  // across its own shim hops, so passing it in only hands over stale authority.
  "CMUX_AGENT_RESTORE_LAUNCH",
  // The wrapper derives this from the `--resume` id in its own argv.
  "CMUX_AGENT_RESUME_LAUNCH",
  // Settings-merge names: shell locals plus env set inline on the wrapper's
  // own `node` merge child. None cross the sandbox boundary as ambient env.
  "CMUX_BASE_SETTINGS",
  "CMUX_CLAUDE_HOOK_CMUX_BIN",
  "CMUX_CLAUDE_PID",
  // Marker pair `cmux claude-teams` sets when it re-enters the wrapper to bind
  // a lead session. Forwarding it would suppress the ordinary Claude launch
  // capture that a safehouse agent depends on.
  "CMUX_CLAUDE_TEAMS_CMUX_BIN",
  "CMUX_CLAUDE_TEAMS_WRAPPER_LAUNCH",
  "CMUX_FILTERED_ARGS",
  "CMUX_MERGED_SETTINGS",
  "CMUX_ORIGINAL_NODE_OPTIONS",
  "CMUX_ORIGINAL_NODE_OPTIONS_PRESENT",
  "CMUX_USER_SETTINGS",
  "CMUX_USER_SETTINGS_B64",
] as const;

export const SAFEHOUSE_CMUX_CLAUDE_COMMAND_PRELUDE = [
  `if { [ -n "\${CMUX_SURFACE_ID:-}" ] || [ -n "\${CMUX_CLAUDE_WRAPPER_SHIM:-}" ]; } && [ -z "\${CMUX_CUSTOM_CLAUDE_PATH:-}" ]; then`,
  "_clearance_cmux_path=;",
  "_clearance_cmux_remaining_path=$PATH:;",
  `while [ -n "$_clearance_cmux_remaining_path" ]; do _clearance_cmux_path_entry=\${_clearance_cmux_remaining_path%%:*}; _clearance_cmux_remaining_path=\${_clearance_cmux_remaining_path#*:}; case "$_clearance_cmux_path_entry" in */cmux-cli-shims/*|*/cmux-cli-shims) ;; *) _clearance_cmux_path="\${_clearance_cmux_path:+$_clearance_cmux_path:}$_clearance_cmux_path_entry" ;; esac; done;`,
  'if _clearance_cmux_real_claude=$(PATH="$_clearance_cmux_path" command -v claude 2>/dev/null); then case "$_clearance_cmux_real_claude" in */cmux-cli-shims/*|*/cmux-cli-shims/claude) ;; *) export CMUX_CUSTOM_CLAUDE_PATH="$_clearance_cmux_real_claude" ;; esac; fi;',
  "unset _clearance_cmux_path _clearance_cmux_remaining_path _clearance_cmux_path_entry _clearance_cmux_real_claude;",
  "fi",
].join(" ");

export interface ResolveSafehouseCmuxIntegrationInput {
  env?: NodeJS.ProcessEnv;
  readFile?: (path: string) => string;
}

export interface SafehouseCmuxIntegration {
  addDirs: readonly string[];
  addDirsReadOnly: readonly string[];
  claudeCommandPrelude: string;
  envPass: readonly string[];
  isActive: boolean;
  unreviewedEnvNames: readonly string[];
}

const DEFAULT_CMUX_CLAUDE_WRAPPER_PATH =
  "/Applications/cmux.app/Contents/Resources/bin/cmux-claude-wrapper";
const CMUX_ENV_NAME_PATTERN = /CMUX_[A-Za-z0-9_]+/g;

export function resolveSafehouseCmuxIntegration(
  input: ResolveSafehouseCmuxIntegrationInput = {},
): SafehouseCmuxIntegration {
  const env = input.env ?? process.env;
  const readFile = input.readFile ?? defaultReadFile;

  return {
    addDirs: resolveCmuxWritableDirs({ env }),
    addDirsReadOnly: resolveCmuxReadOnlyDirs({ env }),
    claudeCommandPrelude: SAFEHOUSE_CMUX_CLAUDE_COMMAND_PRELUDE,
    envPass: SAFEHOUSE_CMUX_ENV_PASS,
    isActive: isSafehouseCmuxIntegrationActive({ env }),
    unreviewedEnvNames: resolveUnreviewedCmuxEnvNames({ env, readFile }),
  };
}

function resolveCmuxWritableDirs(input: { env: NodeJS.ProcessEnv }): readonly string[] {
  const sentryCacheDir = homeSentryCacheDir({ env: input.env });
  return sentryCacheDir === undefined || !existsSync(sentryCacheDir) ? [] : [sentryCacheDir];
}

export function safehouseCmuxIntegrationWarningLines(input: {
  commandName: string;
  unreviewedEnvNames: readonly string[];
}): readonly string[] {
  if (input.unreviewedEnvNames.length === 0) {
    return [];
  }

  return [
    `${input.commandName}: cmux wrapper references unreviewed env vars: ${input.unreviewedEnvNames.join(", ")}`,
    `${input.commandName}: update SAFEHOUSE_CMUX_ENV_PASS or SAFEHOUSE_CMUX_WRAPPER_LOCAL_ENV_NAMES after reviewing them.`,
  ];
}

function isSafehouseCmuxIntegrationActive(input: { env: NodeJS.ProcessEnv }): boolean {
  return (
    input.env["CMUX_SURFACE_ID"] !== undefined ||
    input.env["CMUX_CLAUDE_WRAPPER_SHIM"] !== undefined
  );
}

function resolveCmuxReadOnlyDirs(input: { env: NodeJS.ProcessEnv }): readonly string[] {
  const xdgStateHome = normalizeAbsolutePath({ value: input.env["XDG_STATE_HOME"] });
  const stateDir =
    xdgStateHome === undefined ? homeStateDir({ env: input.env }) : path.join(xdgStateHome, "cmux");
  const hooksDir = homeHooksDir({ env: input.env });
  const socketPath = normalizeAbsolutePath({ value: input.env["CMUX_SOCKET_PATH"] });

  return [
    ...new Set([
      "/Applications/cmux.app",
      ...(stateDir === undefined ? [] : [stateDir]),
      ...(hooksDir === undefined || !existsSync(hooksDir) ? [] : [hooksDir]),
      ...(socketPath === undefined ? [] : [path.dirname(socketPath)]),
    ]),
  ];
}

function homeHooksDir(input: { env: NodeJS.ProcessEnv }): string | undefined {
  const home = normalizeAbsolutePath({ value: input.env["HOME"] });
  return home === undefined ? undefined : path.join(home, ".cmux", "hooks");
}

function homeSentryCacheDir(input: { env: NodeJS.ProcessEnv }): string | undefined {
  const home = normalizeAbsolutePath({ value: input.env["HOME"] });
  return home === undefined ? undefined : path.join(home, "Library", "Caches", "io.sentry");
}

function homeStateDir(input: { env: NodeJS.ProcessEnv }): string | undefined {
  const home = normalizeAbsolutePath({ value: input.env["HOME"] });
  return home === undefined ? undefined : path.join(home, ".local", "state", "cmux");
}

function normalizeAbsolutePath(input: { value: string | undefined }): string | undefined {
  if (input.value === undefined || input.value.length === 0 || !path.isAbsolute(input.value)) {
    return undefined;
  }

  return input.value;
}

function resolveUnreviewedCmuxEnvNames(input: {
  env: NodeJS.ProcessEnv;
  readFile: (path: string) => string;
}): readonly string[] {
  const wrapperSource = readFirstAvailableCmuxWrapperSource(input);
  if (wrapperSource === undefined) {
    return [];
  }
  const referencedNames = wrapperSource.match(CMUX_ENV_NAME_PATTERN);
  if (referencedNames === null) {
    return [];
  }
  const reviewedNames = new Set<string>([
    ...SAFEHOUSE_CMUX_ENV_PASS,
    ...SAFEHOUSE_CMUX_WRAPPER_LOCAL_ENV_NAMES,
  ]);

  return [...new Set(referencedNames)].filter((name) => !reviewedNames.has(name)).toSorted();
}

function readFirstAvailableCmuxWrapperSource(input: {
  env: NodeJS.ProcessEnv;
  readFile: (path: string) => string;
}): string | undefined {
  for (const wrapperPath of cmuxWrapperCandidatePaths({ env: input.env })) {
    try {
      return input.readFile(wrapperPath);
    } catch {
      continue;
    }
  }
  return undefined;
}

function cmuxWrapperCandidatePaths(input: { env: NodeJS.ProcessEnv }): readonly string[] {
  const bundledCmuxPath = input.env["CMUX_BUNDLED_CLI_PATH"];
  if (bundledCmuxPath === undefined) {
    return [DEFAULT_CMUX_CLAUDE_WRAPPER_PATH];
  }

  return [
    ...new Set([
      path.join(path.dirname(bundledCmuxPath), "cmux-claude-wrapper"),
      DEFAULT_CMUX_CLAUDE_WRAPPER_PATH,
    ]),
  ];
}

function defaultReadFile(path: string): string {
  return readFileSync(path, "utf8");
}
