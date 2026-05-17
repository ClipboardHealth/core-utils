import { cleanupWorkspaceCli } from "./commands/cleanupWorkspace.ts";
import { doctor } from "./commands/doctor.ts";
import { orchestrate } from "./commands/orchestrator.ts";
import { remoteCli } from "./commands/remoteSetup.ts";
import { setupReposCli } from "./commands/setupRepos.ts";
import { setupWorkspaceCli } from "./commands/setupWorkspace.ts";
import { errorMessage, writeError, writeOutput } from "./lib/util.ts";

interface Subcommand {
  summary: string;
  usage?: string;
  invoke: (argv: string[]) => Promise<void>;
}

function setupUsage(): string {
  return "Usage: crew setup repos [--dry-run] [<repo>...]";
}

async function setupCli(argv: string[]): Promise<void> {
  const [verb, ...rest] = argv;
  if (verb === "repos") {
    await setupReposCli(rest);
    return;
  }
  throw new Error(setupUsage());
}

async function runCli(argv: string[]): Promise<void> {
  let watch = false;
  let dryRun = false;
  let ticket: string | undefined;

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--watch") {
      watch = true;
      continue;
    }
    if (argument === "--dry-run") {
      dryRun = true;
      continue;
    }
    if (argument === "--ticket") {
      const value = argv[index + 1];
      if (value === undefined || value.length === 0 || value.startsWith("-")) {
        throw new Error("crew run --ticket: ticket id is required");
      }
      ticket = value;
      index += 1;
      continue;
    }
    throw new Error(`crew run: unknown argument: ${argument}`);
  }

  if (ticket !== undefined && watch) {
    throw new Error("crew run: --watch and --ticket are mutually exclusive");
  }

  if (ticket === undefined) {
    await orchestrate({ watch, dryRun });
    return;
  }
  await setupWorkspaceCli(ticket, { dryRun });
}

const SUBCOMMANDS: Record<string, Subcommand> = {
  run: {
    summary: "Run the orchestrator (one-shot by default), or provision one ticket with --ticket",
    usage: "[--watch] [--dry-run] [--ticket <ticket>]",
    invoke: runCli,
  },
  doctor: {
    summary: "Verify prereqs against the resolved config",
    invoke: async () => {
      const ok = await doctor();
      if (!ok) {
        process.exitCode = 1;
      }
    },
  },
  cleanup: {
    summary: "Tear down a worktree",
    usage: "[--force] <ticket>",
    invoke: cleanupWorkspaceCli,
  },
  setup: {
    summary: "Project-level setup commands (currently: repos)",
    usage: "repos [--dry-run] [<repo>...]",
    invoke: setupCli,
  },
  remote: {
    summary: "Create, authenticate, bootstrap, and inspect a remote runner",
    usage:
      "setup <runner-name> [--claude] [--github] [--mcp <alias|name=url>] [--checkpoint]\n" +
      "           → crew remote bootstrap <runner-name> <repo> [--branch <branch>]\n" +
      "           → crew remote sessions [<runner-name>]\n" +
      "           → crew remote attach <session-id-or-command> [--runner <runner-name>]\n" +
      "           → crew remote ps [<runner-name>]\n" +
      "           → crew remote interrupt <process-group-id> [--runner <runner-name>]",
    invoke: remoteCli,
  },
};

function printHelp(): void {
  const width = Math.max(...Object.keys(SUBCOMMANDS).map((key) => key.length));
  writeOutput("Usage: crew <command> [...args]\n");
  writeOutput("Commands:");
  for (const [name, command] of Object.entries(SUBCOMMANDS)) {
    writeOutput(`  ${name.padEnd(width)}  ${command.summary}`);
    if (command.usage !== undefined) {
      writeOutput(`  ${" ".repeat(width)}  → crew ${name} ${command.usage}`);
    }
  }
  writeOutput("\nSee README.md for full configuration and behavior.");
}

export async function run(argv: string[]): Promise<void> {
  const [subcommand, ...rest] = argv;

  if (subcommand === undefined || subcommand === "-h" || subcommand === "--help") {
    printHelp();
    if (subcommand === undefined) {
      process.exitCode = 1;
    }
    return;
  }

  const command = SUBCOMMANDS[subcommand];
  if (!command) {
    writeError(`Unknown command: ${subcommand}\n`);
    printHelp();
    process.exitCode = 1;
    return;
  }

  try {
    await command.invoke(rest);
  } catch (error) {
    writeError(errorMessage(error));
    process.exitCode = 1;
  }
}
