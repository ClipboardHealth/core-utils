#!/usr/bin/env node

import {
  ensureClearance,
  parseClearanceCommand,
  restartClearance,
  statusClearance,
  stopClearance,
} from "./launcher.ts";

function logToStderr(message: string): void {
  process.stderr.write(`${message}\n`);
}

async function main(): Promise<void> {
  const command = parseClearanceCommand(process.argv.slice(2));

  if (command === "stop") {
    await stopClearance({ logger: logToStderr });
    return;
  }

  if (command === "restart") {
    await restartClearance({ logger: logToStderr });
    return;
  }

  if (command === "status") {
    const result = await statusClearance({ logger: logToStderr });
    if (result.status === "not-running") {
      process.exitCode = 1;
    }
    return;
  }

  await ensureClearance({ logger: logToStderr });
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exit(2);
});
