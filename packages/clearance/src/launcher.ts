import { spawn } from "node:child_process";
import { closeSync, mkdirSync, openSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import * as net from "node:net";
import { homedir } from "node:os";
import path from "node:path";

import { resolveAllowlist } from "./allowlist.ts";

const CLEARANCE_HOST = "127.0.0.1";
const CLEARANCE_PORT = 19_999;
const CLEARANCE_START_TIMEOUT_MS = 3000;
const CLEARANCE_POLL_INTERVAL_MS = 100;
const CLEARANCE_COMMANDS = ["restart", "start", "status", "stop"] as const;

const FORWARDED_ENV_VARS = [
  "CLEARANCE_ALLOW_HOSTS",
  "CLEARANCE_ALLOW_HOSTS_FILES",
  "CLEARANCE_ALLOW_PORTS",
  "CLEARANCE_ALLOW_PRIVATE_IPS",
  "CLEARANCE_DNS_TTL_MS",
  "CLEARANCE_IDLE_TIMEOUT_MS",
  "CLEARANCE_MAX_SOCKETS",
  "HOME",
  "PATH",
  "XDG_CACHE_HOME",
] as const;

export interface ClearanceCheckInput {
  host: string;
  port: number;
}

export type ClearanceListenerCheck = (input: ClearanceCheckInput) => Promise<boolean>;

export interface SpawnClearanceInput {
  args: readonly string[];
  command: string;
  env: NodeJS.ProcessEnv;
  logPath: string;
}

export type ClearanceSpawner = (input: SpawnClearanceInput) => number;

export interface EnsureClearanceInput {
  cacheDir?: string;
  env?: NodeJS.ProcessEnv;
  envOverrides?: NodeJS.ProcessEnv;
  isListening?: ClearanceListenerCheck;
  logger?: (message: string) => void;
  pollIntervalMs?: number;
  sleep?: (ms: number) => Promise<void>;
  spawnDetached?: ClearanceSpawner;
  timeoutMs?: number;
}

export interface EnsureClearanceResult {
  logPath?: string;
  pid?: number;
  pidPath?: string;
  port: number;
  status: "already-running" | "started";
}

export type ClearanceCommand = (typeof CLEARANCE_COMMANDS)[number];

export interface ProcessKillInput {
  pid: number;
  signal?: NodeJS.Signals;
}

export type ProcessKiller = (input: ProcessKillInput) => void;

export interface StopClearanceInput {
  cacheDir?: string;
  env?: NodeJS.ProcessEnv;
  isListening?: ClearanceListenerCheck;
  kill?: ProcessKiller;
  logger?: (message: string) => void;
  pollIntervalMs?: number;
  sleep?: (ms: number) => Promise<void>;
  timeoutMs?: number;
}

export interface StopClearanceResult {
  pid?: number;
  port: number;
  status: "not-running" | "stopped";
}

export interface StatusClearanceInput {
  cacheDir?: string;
  env?: NodeJS.ProcessEnv;
  isListening?: ClearanceListenerCheck;
  logger?: (message: string) => void;
}

export interface StatusClearanceResult {
  pid?: number;
  port: number;
  status: "not-running" | "running";
}

export interface RestartClearanceInput extends EnsureClearanceInput {
  kill?: ProcessKiller;
}

// import.meta.dirname is `<package>/{src,dist}`; the proxy server bin lives at `<package>/bin/run.js`.
const PACKAGE_ROOT = path.resolve(import.meta.dirname, "..");
const CLEARANCE_BIN_PATH = path.resolve(PACKAGE_ROOT, "bin", "run.js");

export async function isClearanceListening(input: ClearanceCheckInput): Promise<boolean> {
  return await new Promise<boolean>((resolve) => {
    const socket = net.createConnection({ host: input.host, port: input.port });
    socket.setTimeout(500);
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("error", () => {
      socket.destroy();
      resolve(false);
    });
    /* v8 ignore next 4 @preserve -- timeout is a defensive slow-network path; connection refused is the normal closed-port path */
    socket.once("timeout", () => {
      socket.destroy();
      resolve(false);
    });
  });
}

export function spawnClearance(input: SpawnClearanceInput): number {
  const logFile = openSync(input.logPath, "a");
  try {
    const child = spawn(input.command, input.args, {
      detached: true,
      env: input.env,
      stdio: ["ignore", logFile, logFile],
    });
    child.unref();
    /* v8 ignore next 3 @preserve -- Node assigns pid for spawned processes; this is a defensive guard */
    if (child.pid === undefined) {
      throw new Error("clearance process started without a pid");
    }

    return child.pid;
  } finally {
    closeSync(logFile);
  }
}

export async function ensureClearance(
  input: EnsureClearanceInput = {},
): Promise<EnsureClearanceResult> {
  const env = proxyEnv(input);
  /* v8 ignore next @preserve -- default listener is covered directly by isClearanceListening tests */
  const isListening = input.isListening ?? isClearanceListening;
  const logger = input.logger ?? noop;

  if (await isListening({ host: CLEARANCE_HOST, port: CLEARANCE_PORT })) {
    logger(`Clearance already listening on http://${CLEARANCE_HOST}:${CLEARANCE_PORT}`);
    return { port: CLEARANCE_PORT, status: "already-running" };
  }

  // Fail fast with a readable message instead of a "did not start listening" timeout.
  resolveAllowlist({ env });

  const cacheDir = input.cacheDir ?? cacheDirFor(env);
  const logPath = path.join(cacheDir, "clearance.log");
  const pidPath = path.join(cacheDir, "clearance.pid");
  mkdirSync(cacheDir, { recursive: true });

  /* v8 ignore next @preserve -- default spawner is covered directly by spawnClearance tests */
  const spawnDetached = input.spawnDetached ?? spawnClearance;
  const pid = spawnDetached({
    args: [CLEARANCE_BIN_PATH],
    command: process.execPath,
    env: childEnv(env),
    logPath,
  });
  writeFileSync(pidPath, `${pid}\n`);

  const isReady = await pollUntil({
    check: async () => await isListening({ host: CLEARANCE_HOST, port: CLEARANCE_PORT }),
    pollIntervalMs: input.pollIntervalMs ?? CLEARANCE_POLL_INTERVAL_MS,
    sleep: input.sleep ?? defaultSleep,
    timeoutMs: input.timeoutMs ?? CLEARANCE_START_TIMEOUT_MS,
  });
  if (!isReady) {
    throw new Error(
      `Clearance did not start listening on ${CLEARANCE_HOST}:${CLEARANCE_PORT}; check ${logPath}`,
    );
  }

  logger(
    `Started clearance on http://${CLEARANCE_HOST}:${CLEARANCE_PORT} (pid ${pid}); logs: ${logPath}`,
  );
  return { logPath, pid, pidPath, port: CLEARANCE_PORT, status: "started" };
}

export function parseClearanceCommand(cliArguments: readonly string[]): ClearanceCommand {
  const [first] = cliArguments;
  if (first === undefined) {
    return "start";
  }

  if (isClearanceCommand(first)) {
    return first;
  }

  throw new Error(
    `Unknown clearance-ensure command: ${first}. Use ${CLEARANCE_COMMANDS.join(", ")}.`,
  );
}

export async function stopClearance(input: StopClearanceInput = {}): Promise<StopClearanceResult> {
  const { isListening, logger, pidPath } = resolveLifecycleContext(input);
  /* v8 ignore next @preserve -- default killer signals a real process; tests inject kill instead */
  const kill = input.kill ?? defaultKill;

  const pid = readPidFile(pidPath);
  if (pid === undefined) {
    logger(`Clearance is not running (no pidfile at ${pidPath})`);
    return { port: CLEARANCE_PORT, status: "not-running" };
  }

  let didSignal = false;
  try {
    kill({ pid });
    didSignal = true;
  } catch (error) {
    if (!isAlreadyGoneError(error)) {
      throw error;
    }
  }

  if (didSignal) {
    const stopped = await pollUntil({
      check: async () => !(await isListening({ host: CLEARANCE_HOST, port: CLEARANCE_PORT })),
      pollIntervalMs: input.pollIntervalMs ?? CLEARANCE_POLL_INTERVAL_MS,
      sleep: input.sleep ?? defaultSleep,
      timeoutMs: input.timeoutMs ?? CLEARANCE_START_TIMEOUT_MS,
    });
    if (!stopped) {
      throw new Error(
        `Clearance (pid ${pid}) did not stop listening on ${CLEARANCE_HOST}:${CLEARANCE_PORT}`,
      );
    }
  }

  rmSync(pidPath, { force: true });

  if (didSignal) {
    logger(`Stopped clearance (pid ${pid})`);
    return { pid, port: CLEARANCE_PORT, status: "stopped" };
  }

  logger(`Clearance (pid ${pid}) was already gone; removed stale pidfile ${pidPath}`);
  return { pid, port: CLEARANCE_PORT, status: "not-running" };
}

export async function statusClearance(
  input: StatusClearanceInput = {},
): Promise<StatusClearanceResult> {
  const { isListening, logger, pidPath } = resolveLifecycleContext(input);

  const pid = readPidFile(pidPath);
  const url = `http://${CLEARANCE_HOST}:${CLEARANCE_PORT}`;

  if (await isListening({ host: CLEARANCE_HOST, port: CLEARANCE_PORT })) {
    if (pid === undefined) {
      logger(`Clearance is running on ${url}`);
      return { port: CLEARANCE_PORT, status: "running" };
    }

    logger(`Clearance is running (pid ${pid}) on ${url}`);
    return { pid, port: CLEARANCE_PORT, status: "running" };
  }

  logger(`Clearance is not running on ${url}`);
  return { port: CLEARANCE_PORT, status: "not-running" };
}

export async function restartClearance(
  input: RestartClearanceInput = {},
): Promise<EnsureClearanceResult> {
  // stopClearance ignores the ensure-only fields (envOverrides, spawnDetached) and
  // ensureClearance ignores `kill`, so the combined input is safe to forward to both.
  await stopClearance(input);
  return await ensureClearance(input);
}

function noop(): void {
  // No-op default for the optional logger hook.
}

/* v8 ignore start @preserve -- signaling is exercised through an injected kill in stopClearance tests */
function defaultKill(input: ProcessKillInput): void {
  process.kill(input.pid, input.signal);
}
/* v8 ignore stop */

function readPidFile(pidPath: string): number | undefined {
  let raw: string;
  try {
    raw = readFileSync(pidPath, "utf8");
  } catch {
    return undefined;
  }

  const pid = Number.parseInt(raw.trim(), 10);
  return pid > 0 ? pid : undefined;
}

function isAlreadyGoneError(error: unknown): boolean {
  /* v8 ignore next @preserve -- defensive: thrown kill errors are always Error instances carrying a code */
  if (!(error instanceof Error) || !("code" in error)) {
    return false;
  }

  return error.code === "ESRCH";
}

function isClearanceCommand(value: string): value is ClearanceCommand {
  return (CLEARANCE_COMMANDS as readonly string[]).includes(value);
}

interface LifecycleContext {
  isListening: ClearanceListenerCheck;
  logger: (message: string) => void;
  pidPath: string;
}

function resolveLifecycleContext(input: {
  cacheDir?: string;
  env?: NodeJS.ProcessEnv;
  isListening?: ClearanceListenerCheck;
  logger?: (message: string) => void;
}): LifecycleContext {
  const env = input.env ?? defaultProxyEnv();
  const cacheDir = input.cacheDir ?? cacheDirFor(env);
  return {
    /* v8 ignore next @preserve -- default listener is covered directly by isClearanceListening tests */
    isListening: input.isListening ?? isClearanceListening,
    logger: input.logger ?? noop,
    pidPath: path.join(cacheDir, "clearance.pid"),
  };
}

function cacheDirFor(env: NodeJS.ProcessEnv): string {
  const xdgCacheHome = env["XDG_CACHE_HOME"];
  if (xdgCacheHome !== undefined && xdgCacheHome.length > 0) {
    return path.join(xdgCacheHome, "clearance");
  }

  const home = env["HOME"];
  /* v8 ignore else @preserve -- tests use HOME/XDG_CACHE_HOME to avoid writing to the real home dir */
  if (home !== undefined && home.length > 0) {
    return path.join(home, ".cache", "clearance");
  }

  /* v8 ignore next @preserve -- tests pass HOME/XDG_CACHE_HOME to avoid writing to the real home dir */
  return path.join(homedir(), ".cache", "clearance");
}

function childEnv(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  return {
    ...env,
    CLEARANCE_LISTEN_HOST: CLEARANCE_HOST,
    CLEARANCE_PORT: String(CLEARANCE_PORT),
  };
}

function proxyEnv(input: Pick<EnsureClearanceInput, "env" | "envOverrides">): NodeJS.ProcessEnv {
  const env = input.env ?? defaultProxyEnv();
  if (input.envOverrides === undefined) {
    return env;
  }

  return {
    ...env,
    ...input.envOverrides,
  };
}

function defaultProxyEnv(): NodeJS.ProcessEnv {
  return Object.fromEntries(
    FORWARDED_ENV_VARS
      // oxlint-disable-next-line node/no-process-env -- centralized env accessor for the launcher CLI
      .map((name) => [name, process.env[name]] as const)
      .filter(([, value]) => value !== undefined),
  );
}

async function pollUntil(input: {
  check: () => Promise<boolean>;
  pollIntervalMs: number;
  sleep: (ms: number) => Promise<void>;
  timeoutMs: number;
}): Promise<boolean> {
  const attempts = Math.max(1, Math.ceil(input.timeoutMs / input.pollIntervalMs));
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    // eslint-disable-next-line no-await-in-loop -- readiness polling is intentionally sequential
    if (await input.check()) {
      return true;
    }
    // eslint-disable-next-line no-await-in-loop -- readiness polling is intentionally sequential
    await input.sleep(input.pollIntervalMs);
  }

  return false;
}

async function defaultSleep(ms: number): Promise<void> {
  await new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}
