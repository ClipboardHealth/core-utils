#!/usr/bin/env node

import { runCli } from "./runCli";

async function main(): Promise<void> {
  try {
    const exitCode = await runCli({
      arguments_: process.argv.slice(2),
      cwd: process.cwd(),
      writeError: (output) => {
        process.stderr.write(output);
      },
    });
    process.exitCode = exitCode;
  } catch (error: unknown) {
    process.stderr.write(`${getErrorMessage(error)}\n`);
    process.exitCode = 1;
  }
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

// eslint-disable-next-line unicorn/prefer-top-level-await -- the published CLI is CommonJS
void main();
