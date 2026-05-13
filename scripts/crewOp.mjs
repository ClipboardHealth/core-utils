#!/usr/bin/env node
/// <reference types="node" />

// Dev-mode `crew` runner: wraps `op run --env-file <file>` around a node
// invocation of `packages/groundcrew/bin/run.js`. That bin script's runCli
// helper detects no compiled `src/main.js` in this monorepo and re-execs
// with `--conditions @clipboard-health/source`, so cross-package
// `@clipboard-health/*` imports resolve to TypeScript source.
//
// The 1Password env-file path is fixed at
// `${XDG_CONFIG_HOME:-$HOME/.config}/groundcrew/op.env`. Symlink there if
// you keep yours elsewhere.

import { spawn } from "node:child_process";
import { homedir } from "node:os";
import { join } from "node:path";

const SHUTDOWN_EXIT_CODE = 130;
const SIGTERM_EXIT_CODE = 143;
const FORCE_KILL_SIGNAL = "SIGKILL";
const FORCE_KILL_DELAY_MS = 5000;

// oxlint-disable-next-line node/no-process-env -- XDG base-directory lookup
const xdgConfigHome = process.env.XDG_CONFIG_HOME;
const configBase =
  xdgConfigHome !== undefined && xdgConfigHome.length > 0
    ? xdgConfigHome
    : join(homedir(), ".config");
const envFile = join(configBase, "groundcrew", "op.env");
const args = process.argv.slice(2);
const shouldUseProcessGroup = process.platform !== "win32" && args.includes("--watch");

const child = spawn(
  "op",
  [
    "run",
    "--env-file",
    envFile,
    "--",
    process.execPath,
    "./packages/groundcrew/bin/run.js",
    ...args,
  ],
  {
    detached: shouldUseProcessGroup,
    stdio: "inherit",
  },
);

let shutdownRequested = false;
/** @type {NodeJS.Timeout | undefined} */
let forceKillTimer;

/**
 * @param {NodeJS.Signals} signal
 * @returns {number}
 */
function signalExitCode(signal) {
  if (signal === "SIGINT") {
    return SHUTDOWN_EXIT_CODE;
  }
  if (signal === "SIGTERM") {
    return SIGTERM_EXIT_CODE;
  }
  return 1;
}

/** @param {NodeJS.Signals} signal */
function killChild(signal) {
  if (shouldUseProcessGroup && child.pid !== undefined) {
    try {
      process.kill(-child.pid, signal);
      return;
    } catch {
      // Child already exited — fall through to child.kill.
    }
  }
  child.kill(signal);
}

/** @param {NodeJS.Signals} signal */
function requestShutdown(signal) {
  if (shutdownRequested) {
    if (forceKillTimer !== undefined) {
      clearTimeout(forceKillTimer);
    }
    killChild(FORCE_KILL_SIGNAL);
    process.exit(signalExitCode(signal));
  }
  shutdownRequested = true;
  killChild(signal);
  forceKillTimer = setTimeout(() => {
    killChild(FORCE_KILL_SIGNAL);
    process.exit(signalExitCode(signal));
  }, FORCE_KILL_DELAY_MS);
}

process.on("SIGINT", requestShutdown);
process.on("SIGTERM", requestShutdown);

child.on("error", (error) => {
  if (forceKillTimer !== undefined) {
    clearTimeout(forceKillTimer);
  }
  process.off("SIGINT", requestShutdown);
  process.off("SIGTERM", requestShutdown);
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
});

child.on("exit", (status, signal) => {
  if (forceKillTimer !== undefined) {
    clearTimeout(forceKillTimer);
  }
  process.off("SIGINT", requestShutdown);
  process.off("SIGTERM", requestShutdown);
  if (status !== null) {
    process.exit(status);
  }
  process.exit(signal === null ? 1 : signalExitCode(signal));
});
