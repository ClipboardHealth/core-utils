/**
 * doctor — verify groundcrew prerequisites against the resolved config.
 * Returns true if every required check passes; false otherwise.
 */

import { existsSync, statSync } from "node:fs";

import { runCommandAsync } from "../lib/commandRunner.ts";
import { loadConfig, type ResolvedConfig } from "../lib/config.ts";
import { detectHostCapabilities, type HostCapabilities, which } from "../lib/host.ts";
import { resolveIsolationStrategy, type StrategyResolution } from "../lib/isolation.ts";
import { errorMessage, readEnvironmentVariable, writeOutput } from "../lib/util.ts";
import { resolveWorkspaceKind, type WorkspaceResolution } from "../lib/workspaces.ts";

// Tokenization stops after this many non-flag tokens. Two is enough to
// catch wrapper + wrapped CLI commands like `safehouse claude --foo`.
// `sbx run` is handled specially because `run` is a subcommand, not a
// dependency the user installs separately.
const MAX_TOKENS_PER_CMD = 2;

interface Check {
  name: string;
  ok: boolean;
  required: boolean;
  hint?: string;
}

async function checkCmd(cmd: string, required: boolean, hint?: string): Promise<Check> {
  const path = await which(cmd);
  const resolvedHint = path ?? hint;
  const result: Check = {
    name: cmd,
    ok: path !== undefined,
    required,
  };
  if (resolvedHint !== undefined) {
    result.hint = resolvedHint;
  }
  return result;
}

async function checkSbxDiagnose(): Promise<Check> {
  try {
    await runCommandAsync("sbx", ["diagnose"]);
    return {
      name: "sbx diagnose",
      ok: true,
      required: true,
      hint: "Docker Sandboxes ready",
    };
  } catch {
    return {
      name: "sbx diagnose",
      ok: false,
      required: true,
      hint: "run `sbx daemon start` and `sbx login`, then retry",
    };
  }
}

function checkEnvironment(name: string): Check {
  const value = readEnvironmentVariable(name);
  const set = value !== undefined && value.length > 0;
  return {
    name: `$${name}`,
    ok: set,
    required: true,
    hint: set ? "set" : "export the variable in your shell",
  };
}

function checkDir(path: string, label: string): Check {
  // statSync can throw on permission errors or path races; surface those
  // as a failed check rather than letting them abort the whole doctor run.
  let exists = false;
  try {
    exists = existsSync(path) && statSync(path).isDirectory();
  } catch {
    exists = false;
  }
  return {
    name: `${label} (${path})`,
    ok: exists,
    required: true,
    hint: exists ? "exists" : `mkdir -p "${path}"`,
  };
}

/**
 * Tokens worth checking against PATH from a model's `cmd`:
 * the executable name (first non-flag token), and any subsequent
 * non-flag, non-flag-value token until a flag is hit. Flag tokens are
 * dropped along with the token immediately following them (treated as
 * the flag's value).
 *
 * Examples:
 *   "safehouse claude --permission-mode auto" → ["safehouse", "claude"]
 *   "claude"                                  → ["claude"]
 *   "node --inspect script.ts"                → ["node"]  (script.ts skipped — flag value)
 */
function commandTokensToCheck(cmd: string): string[] {
  const parts = cmd.trim().split(/\s+/);
  const result: string[] = [];
  let index = 0;
  while (index < parts.length) {
    const token = parts[index];
    /* v8 ignore next 4 @preserve -- split(/\s+/) returns no undefined entries within bounds */
    if (token === undefined) {
      index += 1;
      continue;
    }
    if (token.startsWith("-")) {
      // Skip the flag and its value (next token), if any.
      index += 2;
      continue;
    }
    result.push(token);
    if (result.length >= MAX_TOKENS_PER_CMD) {
      break;
    }
    index += 1;
  }
  return result;
}

function gatherToolTokens(
  config: ResolvedConfig,
  resolutions: Map<string, IsolationOutcome>,
): string[] {
  const all = new Set<string>();
  for (const [name, definition] of Object.entries(config.models.definitions)) {
    const outcome = resolutions.get(name);
    if (outcome === undefined || outcome.kind === "error") {
      continue;
    }
    if (outcome.resolution.resolved === "docker") {
      all.add("sbx");
      continue;
    }
    if (outcome.resolution.resolved === "safehouse") {
      all.add("safehouse");
    }
    // The agent command (claude, codex, …) still has to be on PATH for the
    // host strategies, so tokenize it regardless.
    for (const token of commandTokensToCheck(definition.cmd)) {
      all.add(token);
    }
  }
  return [...all];
}

function anyModelUsesUsage(config: ResolvedConfig): boolean {
  return Object.values(config.models.definitions).some(
    (definition) => definition.usage !== undefined,
  );
}

function format(check: Check): string {
  let tag: string;
  if (check.ok) {
    tag = "[ok] ";
  } else if (check.required) {
    tag = "[--] ";
  } else {
    tag = "[? ] ";
  }
  /* v8 ignore next @preserve -- hints are always non-empty when set */
  const hint = check.hint !== undefined && check.hint.length > 0 ? `  — ${check.hint}` : "";
  return `${tag}${check.name}${hint}`;
}

export async function doctor(): Promise<boolean> {
  writeOutput("groundcrew doctor");
  writeOutput("=================");

  let config: ResolvedConfig;
  try {
    config = await loadConfig();
    writeOutput("[ok] config loaded");
  } catch (error) {
    writeOutput(`[--] config: ${errorMessage(error)}`);
    return false;
  }

  const host = await detectHostCapabilities();
  const resolutions = resolveAllStrategies(config, host);
  reportIsolationStrategies(config, resolutions);

  const workspaceOutcome = resolveWorkspaceOutcome(config, host);
  reportWorkspaceKind(config, workspaceOutcome);

  const checks: Check[] = [
    checkEnvironment("LINEAR_API_KEY"),
    await checkCmd("git", true, "https://git-scm.com/"),
    ...(await workspaceChecks(workspaceOutcome)),
    checkDir(config.workspace.projectDir, "workspace.projectDir"),
    ...isolationChecks(resolutions),
  ];

  const toolTokens = gatherToolTokens(config, resolutions);
  let sbxAvailable = false;
  for (const token of toolTokens) {
    let hint: string | undefined;
    if (token === "safehouse") {
      hint = "macOS-only sandbox; edit config.ts to remove if you're not on macOS";
    }
    // oxlint-disable-next-line no-await-in-loop -- doctor reports tools in deterministic order
    const check = await checkCmd(token, true, hint);
    checks.push(check);
    if (token === "sbx" && check.ok) {
      sbxAvailable = true;
    }
  }

  if (sbxAvailable) {
    checks.push(await checkSbxDiagnose());
  }

  if (anyModelUsesUsage(config)) {
    checks.push(await checkCmd("codexbar", false, "optional — only used for usage gating"));
  }

  for (const check of checks) {
    writeOutput(format(check));
  }

  const failed = checks.filter((check) => !check.ok && check.required);
  writeOutput();
  if (failed.length > 0) {
    writeOutput(`${failed.length} required check(s) failed.`);
    return false;
  }
  writeOutput("All required checks passed.");
  return true;
}

type IsolationOutcome =
  | { kind: "ok"; resolution: StrategyResolution }
  | { kind: "error"; requested: StrategyResolution["requested"]; reason: string };

function resolveAllStrategies(
  config: ResolvedConfig,
  host: HostCapabilities,
): Map<string, IsolationOutcome> {
  const out = new Map<string, IsolationOutcome>();
  for (const [name, definition] of Object.entries(config.models.definitions)) {
    try {
      const resolution = resolveIsolationStrategy({ config, model: name, host });
      out.set(name, { kind: "ok", resolution });
    } catch (error) {
      const requested = definition.isolation ?? config.models.isolation;
      out.set(name, { kind: "error", requested, reason: errorMessage(error) });
    }
  }
  return out;
}

function isolationChecks(resolutions: Map<string, IsolationOutcome>): Check[] {
  const checks: Check[] = [];
  for (const [name, outcome] of resolutions) {
    if (outcome.kind === "ok") {
      continue;
    }
    checks.push({
      name: `isolation[${name}]`,
      ok: false,
      required: true,
      hint: outcome.reason,
    });
  }
  return checks;
}

function reportIsolationStrategies(
  config: ResolvedConfig,
  resolutions: Map<string, IsolationOutcome>,
): void {
  writeOutput();
  writeOutput("Isolation strategy");
  writeOutput("------------------");
  writeOutput(`global default: ${config.models.isolation}`);
  for (const [name, outcome] of resolutions) {
    if (outcome.kind === "ok") {
      const { requested, resolved, reason } = outcome.resolution;
      writeOutput(`[ok] ${name}: requested=${requested}, resolved=${resolved} (${reason})`);
    } else {
      writeOutput(`[--] ${name}: requested=${outcome.requested} — ${outcome.reason}`);
    }
  }
}

type WorkspaceOutcome =
  | { kind: "ok"; resolution: WorkspaceResolution }
  | { kind: "error"; requested: ResolvedConfig["workspaceKind"]; reason: string };

function resolveWorkspaceOutcome(config: ResolvedConfig, host: HostCapabilities): WorkspaceOutcome {
  try {
    return { kind: "ok", resolution: resolveWorkspaceKind({ config, host }) };
  } catch (error) {
    return { kind: "error", requested: config.workspaceKind, reason: errorMessage(error) };
  }
}

function reportWorkspaceKind(config: ResolvedConfig, outcome: WorkspaceOutcome): void {
  writeOutput();
  writeOutput("Workspace");
  writeOutput("---------");
  writeOutput(`requested: ${config.workspaceKind}`);
  if (outcome.kind === "ok") {
    const { requested, resolved, reason } = outcome.resolution;
    writeOutput(`[ok] requested=${requested}, resolved=${resolved} (${reason})`);
  } else {
    writeOutput(`[--] requested=${outcome.requested} — ${outcome.reason}`);
  }
}

async function workspaceChecks(outcome: WorkspaceOutcome): Promise<Check[]> {
  if (outcome.kind === "error") {
    return [{ name: "workspaceKind", ok: false, required: true, hint: outcome.reason }];
  }
  const { resolved } = outcome.resolution;
  return [await checkCmd(resolved, true, `install ${resolved} first`)];
}
