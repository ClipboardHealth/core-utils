#!/usr/bin/env node
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const runBinPath = fileURLToPath(new URL("run.js", import.meta.url));
const child = spawn("op", ["run", "--", process.execPath, runBinPath, ...process.argv.slice(2)], {
  // oxlint-disable-next-line node/no-process-env -- op run needs the caller's environment so secret references can be resolved without writing secrets to disk.
  env: process.env,
  stdio: "inherit",
});

child.on("error", (error) => {
  process.stderr.write(`Failed to execute op run: ${error.message}\n`);
  process.exitCode = 1;
});

child.on("exit", (code, signal) => {
  if (signal !== null) {
    process.kill(process.pid, signal);
    return;
  }

  process.exitCode = code ?? 1;
});
