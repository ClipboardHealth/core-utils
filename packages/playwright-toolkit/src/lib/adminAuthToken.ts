import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { createDeterministicHash, isRecord } from "@clipboard-health/util-ts";

import { runWithRetry } from "./retry";

// cspell:ignore defineauthchallenge getparameters maketesttoken
const DEFAULT_CACHE_DIRECTORY_NAME = "clipboard-health-playwright-admin-auth";
const DEFAULT_LOCK_STALE_AFTER_MS = 5 * 60 * 1000;
const DEFAULT_LOCK_WAIT_TIMEOUT_MS = 6 * 60 * 1000;
const DEFAULT_LOCK_RETRY_DELAY_MS = 250;
const DEFAULT_LOCK_RETRY_JITTER_MS = 250;
const BEARER_TOKEN_PREFIX = "Bearer ";
const DEFAULT_COMMAND_TIMEOUT_MS = 30_000;
const DEFAULT_GENERATION_MAX_ATTEMPTS = 4;
const DEFAULT_GENERATION_RETRY_DELAY_MS = 2000;
const DEFAULT_GENERATION_RETRY_JITTER_MS = 1000;
const REDACTED_USER_LABEL = "[redacted-user]";

export interface AdminAuthTokenCacheEntry {
  authToken: string;
  expiresAtMs: number;
}

export interface GetOrCreateAdminAuthTokenParams {
  adminEmail: string;
  apiEnvironmentName: string;
  cacheDurationMs: number;
  createToken: () => Promise<string>;
  cacheDirectory?: string | undefined;
  lockStaleAfterMs?: number | undefined;
  lockWaitTimeoutMs?: number | undefined;
  lockRetryDelayMs?: number | undefined;
  lockRetryJitterMs?: number | undefined;
  nowImplementation?: (() => number) | undefined;
  randomImplementation?: (() => number) | undefined;
  sleepImplementation?: ((params: { durationMs: number }) => Promise<void>) | undefined;
}

export interface AdminAuthTokenCommandResult {
  stdout: string;
  stderr: string;
}

export interface AdminAuthTokenCommandRunnerParams {
  executable: string;
  arguments: readonly string[];
  timeoutMs: number;
}

export type AdminAuthTokenCommandRunner = (
  params: AdminAuthTokenCommandRunnerParams,
) => Promise<AdminAuthTokenCommandResult>;

export interface GenerateAdminAuthTokenParams extends Omit<
  GetOrCreateAdminAuthTokenParams,
  "createToken"
> {
  clientName?: string | undefined;
  commandExecutable?: string | undefined;
  commandRunner?: AdminAuthTokenCommandRunner | undefined;
  commandTimeoutMs?: number | undefined;
  generationMaxAttempts?: number | undefined;
  generationRetryDelayMs?: number | undefined;
  retryJitterMs?: number | undefined;
}

interface StoredAdminAuthTokenCacheEntry {
  authToken: string;
  expiresAtMs: number;
}

interface AdminAuthTokenCachePaths {
  cacheDirectoryPath: string;
  cacheFilePath: string;
  lockFilePath: string;
}

interface AdminAuthTokenLock {
  ownerId: string;
  createdAtMs: number;
  pid: number;
}

/**
 * Returns a valid cached admin token or creates one while holding an atomic
 * filesystem lock shared by Playwright workers, shards, and local processes.
 */
export async function getOrCreateAdminAuthToken(
  params: GetOrCreateAdminAuthTokenParams,
): Promise<AdminAuthTokenCacheEntry> {
  validateParams(params);

  const cachePaths = getCachePaths(params);
  const nowImplementation = params.nowImplementation ?? Date.now;

  await mkdir(cachePaths.cacheDirectoryPath, { recursive: true });

  const cachedEntry = await readCachedEntry({
    cacheFilePath: cachePaths.cacheFilePath,
    nowImplementation,
  });
  if (cachedEntry !== undefined) {
    return cachedEntry;
  }

  return await getOrCreateWithLock({
    ...params,
    cachePaths,
    nowImplementation,
  });
}

/**
 * Generates an admin token with classified CLI retries, redacted errors, and
 * the lock-serialized cross-process cache.
 */
export async function generateAdminAuthToken(
  params: GenerateAdminAuthTokenParams,
): Promise<AdminAuthTokenCacheEntry> {
  return await getOrCreateAdminAuthToken({
    ...params,
    createToken: async () => {
      const result = await runWithRetry({
        operationName: "generate admin auth token",
        operation: async () => {
          try {
            const commandResult = await (params.commandRunner ?? runAdminAuthTokenCommand)({
              executable: params.commandExecutable ?? "cbh",
              arguments: getTokenCommandArguments(params),
              timeoutMs: params.commandTimeoutMs ?? DEFAULT_COMMAND_TIMEOUT_MS,
            });
            const rawToken = commandResult.stdout.split("\n")[0]?.trim();

            if (rawToken === undefined || rawToken.length === 0) {
              throw new Error("Token generation returned an empty token");
            }

            return `${BEARER_TOKEN_PREFIX}${rawToken}`;
          } catch (error: unknown) {
            throw createSafeAdminAuthTokenError({
              adminEmail: params.adminEmail,
              commandTimeoutMs: params.commandTimeoutMs ?? DEFAULT_COMMAND_TIMEOUT_MS,
              error,
            });
          }
        },
        mode: {
          kind: "classified",
          maxAttempts: params.generationMaxAttempts ?? DEFAULT_GENERATION_MAX_ATTEMPTS,
          delayMs: ({ attemptNumber }) =>
            (params.generationRetryDelayMs ?? DEFAULT_GENERATION_RETRY_DELAY_MS) * attemptNumber +
            Math.floor(
              (params.randomImplementation?.() ?? Math.random()) *
                (params.retryJitterMs ?? DEFAULT_GENERATION_RETRY_JITTER_MS),
            ),
          isTransient: ({ error }) => isRetryableAdminAuthTokenGenerationError({ error }),
        },
        sleepImplementation: params.sleepImplementation,
        nowImplementation: params.nowImplementation,
      });

      return result.value;
    },
  });
}

export function isRetryableAdminAuthTokenGenerationError(params: { error: unknown }): boolean {
  if (!(params.error instanceof Error)) {
    return false;
  }

  const normalizedMessage = params.error.message.toLowerCase();

  if (normalizedMessage.includes("timed out after")) {
    return true;
  }

  if (normalizedMessage.includes("too many requests")) {
    return true;
  }

  if (
    normalizedMessage.includes("defineauthchallenge failed") &&
    normalizedMessage.includes("ssm:getparameters") &&
    normalizedMessage.includes("s2s-external-client/zendesk-auto-login/client_id")
  ) {
    return true;
  }

  return (
    (normalizedMessage.includes("maketesttoken") ||
      normalizedMessage.includes("make_test_token")) &&
    normalizedMessage.includes("incorrect username or password")
  );
}

export function isAdminAuthTokenExpired(params: {
  cacheEntry: Pick<AdminAuthTokenCacheEntry, "expiresAtMs">;
  nowMs?: number;
}): boolean {
  return (params.nowMs ?? Date.now()) >= params.cacheEntry.expiresAtMs;
}

async function getOrCreateWithLock(
  params: GetOrCreateAdminAuthTokenParams & {
    cachePaths: AdminAuthTokenCachePaths;
    nowImplementation: () => number;
  },
): Promise<AdminAuthTokenCacheEntry> {
  const waitStartedAtMs = params.nowImplementation();
  const lockWaitTimeoutMs = params.lockWaitTimeoutMs ?? DEFAULT_LOCK_WAIT_TIMEOUT_MS;
  const sleepImplementation = params.sleepImplementation ?? sleep;

  /* eslint-disable no-await-in-loop -- Lock acquisition and ownership checks are sequential. */
  while (params.nowImplementation() - waitStartedAtMs < lockWaitTimeoutMs) {
    const lock = await tryAcquireLock({
      lockFilePath: params.cachePaths.lockFilePath,
      nowImplementation: params.nowImplementation,
    });

    if (lock !== undefined) {
      try {
        const cachedEntry = await readCachedEntry({
          cacheFilePath: params.cachePaths.cacheFilePath,
          nowImplementation: params.nowImplementation,
        });
        if (cachedEntry !== undefined) {
          return cachedEntry;
        }

        const authToken = await params.createToken();
        if (!isValidBearerToken(authToken)) {
          throw new Error("Generated admin auth token is malformed");
        }

        const storedEntry = {
          authToken,
          expiresAtMs: params.nowImplementation() + params.cacheDurationMs,
        };
        await writeCachedEntry({
          cacheFilePath: params.cachePaths.cacheFilePath,
          storedEntry,
        });

        return storedEntry;
      } finally {
        await releaseLock({
          lockFilePath: params.cachePaths.lockFilePath,
          ownerId: lock.ownerId,
        });
      }
    }

    await removeStaleLock({
      lockFilePath: params.cachePaths.lockFilePath,
      lockStaleAfterMs: params.lockStaleAfterMs ?? DEFAULT_LOCK_STALE_AFTER_MS,
      nowImplementation: params.nowImplementation,
    });
    const retryDelayMs =
      (params.lockRetryDelayMs ?? DEFAULT_LOCK_RETRY_DELAY_MS) +
      Math.floor(
        (params.randomImplementation?.() ?? Math.random()) *
          (params.lockRetryJitterMs ?? DEFAULT_LOCK_RETRY_JITTER_MS),
      );
    await sleepImplementation({ durationMs: retryDelayMs });
  }
  /* eslint-enable no-await-in-loop */

  throw new Error(
    `Timed out waiting for admin auth token cache lock: ${params.cachePaths.lockFilePath}`,
  );
}

function validateParams(params: GetOrCreateAdminAuthTokenParams): void {
  if (params.adminEmail.trim().length === 0) {
    throw new Error("adminEmail must not be empty");
  }

  if (params.apiEnvironmentName.trim().length === 0) {
    throw new Error("apiEnvironmentName must not be empty");
  }

  if (!Number.isFinite(params.cacheDurationMs) || params.cacheDurationMs <= 0) {
    throw new Error("cacheDurationMs must be positive");
  }
}

function getCachePaths(params: GetOrCreateAdminAuthTokenParams): AdminAuthTokenCachePaths {
  const cacheDirectoryPath =
    params.cacheDirectory ?? path.join(tmpdir(), DEFAULT_CACHE_DIRECTORY_NAME);
  const environmentSegment = params.apiEnvironmentName.replaceAll(/[^a-zA-Z0-9._-]/g, "_");
  const cacheKeyHash = createDeterministicHash(
    `${params.apiEnvironmentName}\0${params.adminEmail}`,
  ).slice(0, 16);
  const cacheFileName = `admin-auth-token-${environmentSegment}-${cacheKeyHash}.json`;

  return {
    cacheDirectoryPath,
    cacheFilePath: path.join(cacheDirectoryPath, cacheFileName),
    lockFilePath: path.join(cacheDirectoryPath, `${cacheFileName}.lock`),
  };
}

async function readCachedEntry(params: {
  cacheFilePath: string;
  nowImplementation: () => number;
}): Promise<StoredAdminAuthTokenCacheEntry | undefined> {
  try {
    const contents = await readFile(params.cacheFilePath, "utf8");
    const parsed: unknown = JSON.parse(contents);

    if (!isStoredCacheEntry(parsed)) {
      return undefined;
    }

    if (params.nowImplementation() >= parsed.expiresAtMs) {
      return undefined;
    }

    return parsed;
  } catch (error: unknown) {
    if (isNodeErrorWithCode({ error, code: "ENOENT" }) || error instanceof SyntaxError) {
      return undefined;
    }

    throw error;
  }
}

function isStoredCacheEntry(value: unknown): value is StoredAdminAuthTokenCacheEntry {
  return (
    isRecord(value) &&
    typeof value["authToken"] === "string" &&
    isValidBearerToken(value["authToken"]) &&
    typeof value["expiresAtMs"] === "number" &&
    Number.isFinite(value["expiresAtMs"])
  );
}

async function writeCachedEntry(params: {
  cacheFilePath: string;
  storedEntry: StoredAdminAuthTokenCacheEntry;
}): Promise<void> {
  const temporaryFilePath = `${params.cacheFilePath}.${process.pid}.${randomUUID()}.tmp`;

  try {
    await writeFile(temporaryFilePath, JSON.stringify(params.storedEntry), {
      encoding: "utf8",
      mode: 0o600,
    });
    await rename(temporaryFilePath, params.cacheFilePath);
  } finally {
    await rm(temporaryFilePath, { force: true });
  }
}

async function tryAcquireLock(params: {
  lockFilePath: string;
  nowImplementation: () => number;
}): Promise<AdminAuthTokenLock | undefined> {
  const lock = {
    ownerId: `${process.pid}-${randomUUID()}`,
    createdAtMs: params.nowImplementation(),
    pid: process.pid,
  };

  try {
    await writeFile(params.lockFilePath, JSON.stringify(lock), {
      encoding: "utf8",
      flag: "wx",
      mode: 0o600,
    });
    return lock;
  } catch (error: unknown) {
    if (isNodeErrorWithCode({ error, code: "EEXIST" })) {
      return undefined;
    }

    throw error;
  }
}

async function removeStaleLock(params: {
  lockFilePath: string;
  lockStaleAfterMs: number;
  nowImplementation: () => number;
}): Promise<void> {
  try {
    const lock = await readLock(params.lockFilePath);
    const lockFileStats = await stat(params.lockFilePath);
    const lockCreatedAtMs = lock?.createdAtMs ?? lockFileStats.mtimeMs;

    if (params.nowImplementation() - lockCreatedAtMs < params.lockStaleAfterMs) {
      return;
    }

    if (lock === undefined) {
      await rm(params.lockFilePath, { force: true });
      return;
    }

    await releaseLock({
      lockFilePath: params.lockFilePath,
      ownerId: lock.ownerId,
    });
  } catch (error: unknown) {
    if (!isNodeErrorWithCode({ error, code: "ENOENT" })) {
      throw error;
    }
  }
}

async function releaseLock(params: { lockFilePath: string; ownerId: string }): Promise<void> {
  const currentLock = await readLock(params.lockFilePath);

  if (currentLock?.ownerId === params.ownerId) {
    await rm(params.lockFilePath, { force: true });
  }
}

async function readLock(lockFilePath: string): Promise<AdminAuthTokenLock | undefined> {
  try {
    const contents = await readFile(lockFilePath, "utf8");
    const parsed: unknown = JSON.parse(contents);

    return isAdminAuthTokenLock(parsed) ? parsed : undefined;
  } catch (error: unknown) {
    if (isNodeErrorWithCode({ error, code: "ENOENT" }) || error instanceof SyntaxError) {
      return undefined;
    }

    throw error;
  }
}

function isAdminAuthTokenLock(value: unknown): value is AdminAuthTokenLock {
  return (
    isRecord(value) &&
    typeof value["ownerId"] === "string" &&
    typeof value["createdAtMs"] === "number" &&
    Number.isFinite(value["createdAtMs"]) &&
    typeof value["pid"] === "number" &&
    Number.isFinite(value["pid"])
  );
}

function isValidBearerToken(authToken: string): boolean {
  return (
    authToken === authToken.trim() &&
    authToken.startsWith(BEARER_TOKEN_PREFIX) &&
    authToken.length > BEARER_TOKEN_PREFIX.length
  );
}

function isNodeErrorWithCode(params: { error: unknown; code: string }): boolean {
  return isRecord(params.error) && params.error["code"] === params.code;
}

async function sleep(params: { durationMs: number }): Promise<void> {
  await new Promise<void>((resolve) => {
    setTimeout(resolve, params.durationMs);
  });
}

function getTokenCommandArguments(params: GenerateAdminAuthTokenParams): string[] {
  const argumentsList = [
    "auth",
    "gentoken",
    "user",
    params.apiEnvironmentName,
    params.adminEmail,
    "--quiet",
  ];

  if (params.clientName !== undefined) {
    argumentsList.push("-n", params.clientName);
  }

  return argumentsList;
}

async function runAdminAuthTokenCommand(
  params: AdminAuthTokenCommandRunnerParams,
): Promise<AdminAuthTokenCommandResult> {
  return await new Promise<AdminAuthTokenCommandResult>((resolve, reject) => {
    execFile(
      params.executable,
      [...params.arguments],
      {
        encoding: "utf8",
        // oxlint-disable-next-line node/no-process-env -- The CLI needs inherited AWS credentials and config.
        env: { ...process.env, DOTENV_CONFIG_QUIET: "true" },
        timeout: params.timeoutMs,
      },
      (error, stdout, stderr) => {
        if (error !== null) {
          reject(new Error(error.message, { cause: error }));
          return;
        }

        resolve({ stdout, stderr });
      },
    );
  });
}

function createSafeAdminAuthTokenError(params: {
  adminEmail: string;
  commandTimeoutMs: number;
  error: unknown;
}): Error {
  const sourceMessage = params.error instanceof Error ? params.error.message : String(params.error);
  const redactedMessage = sourceMessage.split(params.adminEmail).join(REDACTED_USER_LABEL);
  const timeoutSuffix = isCommandTimeoutError({ error: params.error })
    ? `\nTimed out after ${params.commandTimeoutMs}ms`
    : "";

  return new Error(`${redactedMessage}${timeoutSuffix}`);
}

function isCommandTimeoutError(params: { error: unknown }): boolean {
  const inspectedErrors = new Set<unknown>();
  let error = params.error;

  while (isRecord(error) && !inspectedErrors.has(error)) {
    inspectedErrors.add(error);

    if (
      error["killed"] === true &&
      (error["code"] === "ETIMEDOUT" ||
        error["signal"] === "SIGTERM" ||
        error["signal"] === "SIGKILL")
    ) {
      return true;
    }

    error = error["cause"];
  }

  return false;
}
