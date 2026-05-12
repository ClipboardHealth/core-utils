import { dirname, resolve } from "node:path";

import {
  DEFAULT_HOST_SETUP_COMMAND,
  DEFAULT_SANDBOX_SETUP_COMMAND,
  type ModelDefinition,
} from "./config.js";
import type { ResolvedIsolationStrategy } from "./isolation.js";

/**
 * Build-time secrets we shuttle from groundcrew's process env into the
 * setup phase of the launched workspace and then strip before exec'ing
 * the agent. Adding a name here makes it flow through every isolation
 * strategy automatically.
 */
export const BUILD_SECRET_NAMES = ["NPM_TOKEN", "BUF_TOKEN"] as const;

/**
 * Single-quote `value` for safe shell embedding. Embedded single quotes
 * are closed, escaped, and reopened — `'foo'\''bar'` is "foo'bar" in
 * shell.
 */
export function shellSingleQuote(value: string): string {
  return `'${value.replaceAll("'", String.raw`'\''`)}'`;
}

// import.meta.dirname is `<groundcrew>/{src,dist}/lib`; the shipped Safehouse
// proxy wrapper lives in the sibling clearance package.
const PACKAGES_ROOT = resolve(import.meta.dirname, "..", "..", "..");
const SAFEHOUSE_CLEARANCE_WRAPPER_PATH = resolve(
  PACKAGES_ROOT,
  "clearance",
  "safehouse",
  "safehouse-clearance",
);

function renderAgentCommand(arguments_: {
  agentCmd: string;
  worktreeDir: string;
  sandboxName: string;
}): string {
  return arguments_.agentCmd
    .replaceAll("{{worktree}}", shellSingleQuote(arguments_.worktreeDir))
    .replaceAll("{{sandbox}}", shellSingleQuote(arguments_.sandboxName));
}

function setupWithStatusReporting(setupCommand: string): string {
  return [
    setupCommand,
    "setup_status=$?",
    'if [ "$setup_status" -ne 0 ]; then echo "groundcrew setup command exited with status $setup_status; continuing to agent." >&2; fi',
  ].join("; ");
}

/**
 * Source a `KEY='value'` file with auto-export so build-time secrets land
 * in the shell env before setup runs. The `-f` guard keeps it a no-op if
 * the file disappeared between staging and launch.
 */
function sourceSecretsLine(secretsFile: string): string {
  return `if [ -f ${shellSingleQuote(secretsFile)} ]; then set -a && . ${shellSingleQuote(secretsFile)} && set +a; fi`;
}

function unsetSecretsLine(): string {
  return `unset ${BUILD_SECRET_NAMES.join(" ")}`;
}

interface LaunchCommandArguments {
  definition: ModelDefinition;
  promptFile: string;
  worktreeDir: string;
  sandboxName: string | undefined;
  strategy: ResolvedIsolationStrategy;
  /**
   * Optional path to a `KEY='value'` env file containing build-time
   * secrets (see `BUILD_SECRET_NAMES`). Sourced on the host shell before
   * setup; the values are propagated into the docker sandbox via
   * `sbx exec -e KEY=...`. Always unset before exec'ing the agent so the
   * agent process never inherits them.
   */
  secretsFile?: string | undefined;
}

/**
 * Build the shell command that runs inside the workspace. The prompt is
 * staged in a temp file (so backticks/quotes/$ in the description survive),
 * read into `$_p`, the temp dir is removed, then the agent CLI is exec'd
 * with the prompt as its trailing positional argument. This removes the
 * need for a `readyMarker` poll because the agent starts up with the
 * prompt in hand.
 */
export function buildLaunchCommand(arguments_: LaunchCommandArguments): string {
  const promptDir = dirname(arguments_.promptFile);
  const agentCmd = renderAgentCommand({
    agentCmd: arguments_.definition.cmd,
    worktreeDir: arguments_.worktreeDir,
    sandboxName: arguments_.sandboxName ?? "",
  });

  if (arguments_.strategy === "docker") {
    /* v8 ignore next 5 @preserve -- the resolver rejects docker without a sandbox config and setupWorkspace mirrors that, so sandboxName is always defined here */
    if (arguments_.sandboxName === undefined || arguments_.definition.sandbox === undefined) {
      throw new Error("sandboxName is required for the docker strategy");
    }
    const setupCommand =
      arguments_.definition.sandbox.setupCommand ?? DEFAULT_SANDBOX_SETUP_COMMAND;
    const innerParts = [setupWithStatusReporting(setupCommand)];
    if (arguments_.secretsFile !== undefined) {
      innerParts.push(unsetSecretsLine());
    }
    innerParts.push(`exec ${agentCmd} "$@"`);
    const innerCommand = innerParts.join("; ");
    // Passthrough form (`-e KEY` without `=VALUE`): sbx reads the value from
    // its own env at invocation time, which is populated by sourceSecretsLine
    // a few lines up. Avoids `-e KEY="$KEY"`, which embeds the value in argv
    // and breaks if the token contains `"`, `$`, or `` ` ``.
    const sbxEnvironmentFlags =
      arguments_.secretsFile === undefined
        ? ""
        : `${BUILD_SECRET_NAMES.map((name) => `-e ${name}`).join(" ")} `;
    const lines: string[] = [];
    if (arguments_.secretsFile !== undefined) {
      lines.push(sourceSecretsLine(arguments_.secretsFile));
    }
    lines.push(
      `_p=$(cat ${shellSingleQuote(arguments_.promptFile)})`,
      `rm -rf ${shellSingleQuote(promptDir)}`,
      `exec sbx exec -it ${sbxEnvironmentFlags}-w ${shellSingleQuote(arguments_.worktreeDir)} ${shellSingleQuote(arguments_.sandboxName)} sh -lc ${shellSingleQuote(innerCommand)} sh "$_p"`,
    );
    return lines.join(" && ");
  }

  // Skip the wrap if `cmd` already starts with `safehouse` so configs
  // that predate the isolation strategy don't double-wrap.
  const cmdStartsWithSafehouse = /^safehouse(\s|$)/.test(arguments_.definition.cmd);
  const wrapped =
    arguments_.strategy === "safehouse" && !cmdStartsWithSafehouse
      ? [shellSingleQuote(SAFEHOUSE_CLEARANCE_WRAPPER_PATH), agentCmd].join(" ")
      : agentCmd;
  const lines: string[] = [`cd ${shellSingleQuote(arguments_.worktreeDir)}`];
  if (arguments_.secretsFile !== undefined) {
    lines.push(sourceSecretsLine(arguments_.secretsFile));
  }
  lines.push(setupWithStatusReporting(DEFAULT_HOST_SETUP_COMMAND));
  if (arguments_.secretsFile !== undefined) {
    lines.push(unsetSecretsLine());
  }
  lines.push(
    `_p=$(cat ${shellSingleQuote(arguments_.promptFile)})`,
    `rm -rf ${shellSingleQuote(promptDir)}`,
    `exec ${wrapped} "$_p"`,
  );
  return lines.join(" && ");
}
