#!/usr/bin/env node
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

import { loadConfiguredApiKeyEnvironment } from "./config.js";

const runBinPath = fileURLToPath(new URL("run.js", import.meta.url));
let configuredEnvironment;

try {
  configuredEnvironment = await loadConfiguredApiKeyEnvironment();
} catch (error) {
  process.stderr.write(`Failed to load Tribunal config: ${formatErrorMessage(error)}\n`);
  process.exit(1);
}

const child = spawn("op", ["run", "--", process.execPath, runBinPath, ...process.argv.slice(2)], {
  // oxlint-disable-next-line node/no-process-env -- op run needs caller env plus config-provided 1Password refs, with caller env taking precedence.
  env: { ...configuredEnvironment, ...process.env },
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

function formatErrorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}
