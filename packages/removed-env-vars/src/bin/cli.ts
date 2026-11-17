#!/usr/bin/env node

import { runCli } from "./runCli";

try {
  process.exitCode = runCli({
    arguments_: process.argv.slice(2),
    cwd: process.cwd(),
    isGitHubActions: process.env["GITHUB_ACTIONS"] === "true",
    today: new Date().toISOString().slice(0, 10),
    write: (output) => {
      process.stdout.write(output);
    },
  });
} catch (error: unknown) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 2;
}
