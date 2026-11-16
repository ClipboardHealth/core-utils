#!/usr/bin/env node

import { runCheckSuppressions } from "./runCheckSuppressions";

try {
  const { exitCode } = runCheckSuppressions({
    args: process.argv.slice(2),
    cwd: process.cwd(),
    env: process.env,
    write: (output) => {
      process.stdout.write(output);
    },
  });
  process.exitCode = exitCode;
} catch (error: unknown) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 2;
}
