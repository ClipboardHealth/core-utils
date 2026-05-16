import { Buffer } from "node:buffer";
import { dirname, resolve } from "node:path";

import {
  BUILD_SECRET_NAMES,
  DEFAULT_HOST_SETUP_COMMAND,
  DEFAULT_REMOTE_SETUP_COMMAND,
  type ModelDefinition,
  type RemoteRunnerConfig,
} from "./config.ts";
import { shellSingleQuote } from "./shell.ts";
import type { RemoteRunnerProvider } from "./spriteRemoteRunnerProvider.ts";

export { shellSingleQuote } from "./shell.ts";

// import.meta.dirname is `<groundcrew>/{src,dist}/lib`; the shipped Safehouse
// proxy wrapper lives in the sibling clearance package.
const PACKAGES_ROOT = resolve(import.meta.dirname, "..", "..", "..");
const SAFEHOUSE_CLEARANCE_WRAPPER_PATH = resolve(
  PACKAGES_ROOT,
  "clearance",
  "safehouse",
  "safehouse-clearance",
);

function renderAgentCommand(arguments_: { agentCmd: string; worktreeDir: string }): string {
  return arguments_.agentCmd
    .replaceAll("{{worktree}}", shellSingleQuote(arguments_.worktreeDir))
    .replaceAll("{{sandbox}}", shellSingleQuote(""));
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

function unsetSecretsLine(secretNames: readonly string[] = BUILD_SECRET_NAMES): string {
  return `unset ${secretNames.join(" ")}`;
}

interface LaunchCommandArguments {
  definition: ModelDefinition;
  promptFile: string;
  worktreeDir: string;
  /**
   * Optional path to a `KEY='value'` env file containing build-time
   * secrets (see `BUILD_SECRET_NAMES`). Sourced on the host shell before
   * setup and always unset before exec'ing the agent so the agent process
   * never inherits them.
   */
  secretsFile?: string | undefined;
}

interface RemoteLaunchCommandArguments {
  definition: ModelDefinition;
  provider: RemoteRunnerProvider;
  remoteConfig: RemoteRunnerConfig;
  promptFile: string;
  remotePromptFile: string;
  worktreeDir: string;
  secretNames: readonly string[];
  secretsFile?: string | undefined;
  remoteSecretsFile?: string | undefined;
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
  });

  // Skip the wrap if `cmd` already starts with `safehouse` so legacy
  // configs don't double-wrap.
  const cmdStartsWithSafehouse = /^safehouse(\s|$)/.test(arguments_.definition.cmd);
  const wrapped = cmdStartsWithSafehouse
    ? agentCmd
    : [shellSingleQuote(SAFEHOUSE_CLEARANCE_WRAPPER_PATH), agentCmd].join(" ");
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

export function buildRemoteLaunchCommand(arguments_: RemoteLaunchCommandArguments): string {
  const promptDir = dirname(arguments_.promptFile);
  const agentCmd = renderAgentCommand({
    agentCmd: arguments_.definition.cmd,
    worktreeDir: arguments_.worktreeDir,
  });
  const uploadedFiles = [
    { localPath: arguments_.promptFile, remotePath: arguments_.remotePromptFile },
  ];
  if (arguments_.secretsFile !== undefined && arguments_.remoteSecretsFile !== undefined) {
    uploadedFiles.push({
      localPath: arguments_.secretsFile,
      remotePath: arguments_.remoteSecretsFile,
    });
  }

  const remoteCleanupFiles = [arguments_.remotePromptFile];
  if (arguments_.remoteSecretsFile !== undefined) {
    remoteCleanupFiles.push(arguments_.remoteSecretsFile);
  }
  const remoteCleanupLine = `rm -f ${remoteCleanupFiles.map(shellSingleQuote).join(" ")}`;
  const remoteLines = [`cleanup_remote() { ${remoteCleanupLine}; }`, "trap cleanup_remote EXIT"];
  if (arguments_.remoteSecretsFile !== undefined) {
    remoteLines.push(sourceSecretsLine(arguments_.remoteSecretsFile));
  }
  remoteLines.push(setupWithStatusReporting(DEFAULT_REMOTE_SETUP_COMMAND));
  if (arguments_.remoteSecretsFile !== undefined) {
    remoteLines.push(unsetSecretsLine(arguments_.secretNames));
  }
  remoteLines.push(
    `_p=$(cat ${shellSingleQuote(arguments_.remotePromptFile)})`,
    "cleanup_remote",
    "trap - EXIT",
    `exec ${agentCmd} "$_p"`,
  );

  const encodedRemoteCommand = Buffer.from(remoteLines.join(" && "), "utf8").toString("base64");
  const remoteLauncher = `eval "$(printf %s ${shellSingleQuote(encodedRemoteCommand)} | base64 -d)"`;

  return [
    `cleanup() { rm -rf ${shellSingleQuote(promptDir)}; }`,
    "trap cleanup EXIT",
    arguments_.provider.buildTtyCommand({
      config: arguments_.remoteConfig,
      files: uploadedFiles,
      workingDirectory: arguments_.worktreeDir,
      remoteArguments: ["bash", "-lc", remoteLauncher],
    }),
  ].join("; ");
}
