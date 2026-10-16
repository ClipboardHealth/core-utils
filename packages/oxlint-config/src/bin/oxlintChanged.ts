#!/usr/bin/env node

import { runOxlintChanged } from "../internal/changed/runOxlintChanged";

function main(): void {
  try {
    process.exitCode = runOxlintChanged({
      arguments_: process.argv.slice(2),
      cwd: process.cwd(),
      environment: process.env,
      write: (output) => {
        process.stdout.write(output);
      },
    });
  } catch (error: unknown) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 2;
  }
}

main();
