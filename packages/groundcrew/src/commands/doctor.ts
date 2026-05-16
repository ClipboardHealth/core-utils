/**
 * doctor — verify groundcrew prerequisites against the resolved config.
 * Returns true if every required check passes; false otherwise.
 */

import { existsSync, statSync } from "node:fs";

import { loadConfig, type ResolvedConfig } from "../lib/config.ts";
import { detectHostCapabilities, type HostCapabilities, which } from "../lib/host.ts";
import { errorMessage, readEnvironmentVariable, writeOutput } from "../lib/util.ts";
import { resolveWorkspaceKind, type WorkspaceResolution } from "../lib/workspaces.ts";

// Tokenization stops after this many non-flag tokens. Two is enough to
// catch wrapper + wrapped CLI commands like `safehouse claude --foo`.
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

function gatherToolTokens(config: ResolvedConfig): string[] {
  const all = new Set<string>();
  for (const definition of Object.values(config.models.definitions)) {
    // Local runs execute the agent command on the host; remote runs need the
    // same command in the remote runner, but doctor cannot know ticket labels in advance.
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

  let host: HostCapabilities;
  try {
    host = await detectHostCapabilities();
  } catch (error) {
    writeOutput(`[--] host: ${errorMessage(error)}`);
    return false;
  }
  const localCapability = localCapabilityCheck(host);
  reportLocalCapability(localCapability);

  const workspaceOutcome = resolveWorkspaceOutcome(config, host);
  reportWorkspaceKind(config, workspaceOutcome);

  const checks: Check[] = [
    checkEnvironment("LINEAR_API_KEY"),
    await checkCmd("git", true, "https://git-scm.com/"),
    ...(await workspaceChecks(workspaceOutcome)),
    checkDir(config.workspace.projectDir, "workspace.projectDir"),
    localCapability,
  ];

  const toolTokens = gatherToolTokens(config);
  for (const token of toolTokens) {
    const required = localCapability.ok;
    // oxlint-disable-next-line no-await-in-loop -- doctor reports tools in deterministic order
    const check = await checkCmd(
      token,
      required,
      required
        ? undefined
        : "required for local runs; remote runs need this inside the remote runner",
    );
    checks.push(check);
  }

  if (anyModelUsesUsage(config)) {
    checks.push(await checkCmd("codexbar", false, "optional — only used for usage gating"));
  }

  for (const check of checks) {
    if (check === localCapability) {
      continue;
    }
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

function localCapabilityCheck(host: HostCapabilities): Check {
  if (!host.isMacOS) {
    return {
      name: "local runner (macOS + Safehouse)",
      ok: false,
      required: false,
      hint: "required for local runs; on Linux/WSL use agent-remote with the remote runner",
    };
  }
  return {
    name: "local runner (macOS + Safehouse)",
    ok: host.hasSafehouse,
    required: false,
    hint: host.hasSafehouse
      ? "ready"
      : "required for local runs; install Safehouse from https://agent-safehouse.dev/ and ensure `safehouse` is on PATH",
  };
}

function reportLocalCapability(check: Check): void {
  writeOutput();
  writeOutput("Local runner");
  writeOutput("------------");
  writeOutput(format(check));
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
