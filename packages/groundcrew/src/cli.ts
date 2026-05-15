import { cleanupWorkspaceCli } from "./commands/cleanupWorkspace.ts";
import { doctor } from "./commands/doctor.ts";
import { orchestrate } from "./commands/orchestrator.ts";
import { sandboxAuthCli } from "./commands/sandboxAuth.ts";
import { setupWorkspaceCli } from "./commands/setupWorkspace.ts";
import { spriteCli } from "./commands/spriteSetup.ts";
import { errorMessage, writeError, writeOutput } from "./lib/util.ts";

interface Subcommand {
  summary: string;
  usage?: string;
  invoke: (argv: string[]) => Promise<void>;
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
  sandbox: {
    summary: "Prepare persistent Docker Sandboxes auth",
    usage: "auth <repo> [--model <name>]",
    invoke: sandboxAuthCli,
  },
  sprite: {
    summary: "Create, authenticate, bootstrap, and inspect a remote Sprite runner",
    usage:
      "setup <sprite-name> [--claude] [--github] [--mcp <alias|name=url>] [--checkpoint]\n" +
      "           → crew sprite bootstrap <sprite-name> <repo> [--branch <branch>]\n" +
      "           → crew sprite sessions [<sprite-name>]\n" +
      "           → crew sprite attach <session-id-or-command> [--sprite <sprite-name>]",
    invoke: spriteCli,
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
