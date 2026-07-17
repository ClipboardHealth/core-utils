import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { setTimeout as setTimeoutPromise } from "node:timers/promises";

import { createDeterministicHash, isDefined, isNil, isRecord } from "@clipboard-health/util-ts";

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
const DEFAULT_JWT_EXPIRATION_SAFETY_SKEW_MS = 60_000;
const DEFAULT_VALIDATION_TIMEOUT_MS = 30_000;
const REDACTED_USER_LABEL = "[redacted-user]";

export interface AdminAuthTokenCacheEntry {
  authToken: string;
  expiresAtMs: number;
}

export interface AdminAuthTokenCacheIdentity {
  namespace: string;
  tokenKind: string;
  audience?: string | undefined;
  clientName?: string | undefined;
  issuer?: string | undefined;
}

export type AdminAuthTokenCacheEventKind =
  | "created"
  | "hit"
  | "invalidated"
  | "miss"
  | "refresh"
  | "validation-rejected";

export interface AdminAuthTokenCacheEvent {
  kind: AdminAuthTokenCacheEventKind;
  audience?: string | undefined;
  cacheKeyFingerprint: string;
  credentialFingerprint?: string | undefined;
  expiresAtMs?: number | undefined;
  jwtExpiresAtMs?: number | undefined;
  mintedAtMs?: number | undefined;
  validatedAtMs?: number | undefined;
  validationPolicyFingerprint?: string | undefined;
}

export interface ValidateAdminAuthTokenParams {
  authToken: string;
  signal: AbortSignal;
}

export type AdminAuthTokenCacheEventHandler = (
  event: AdminAuthTokenCacheEvent,
) => Promise<void> | void;

export interface AdminAuthTokenCacheParams {
  adminEmail: string;
  apiEnvironmentName: string;
  cacheIdentity?: AdminAuthTokenCacheIdentity | undefined;
  cacheDirectory?: string | undefined;
  lockStaleAfterMs?: number | undefined;
  lockWaitTimeoutMs?: number | undefined;
  lockRetryDelayMs?: number | undefined;
  lockRetryJitterMs?: number | undefined;
  nowImplementation?: (() => number) | undefined;
  onCacheEvent?: AdminAuthTokenCacheEventHandler | undefined;
  randomImplementation?: (() => number) | undefined;
  sleepImplementation?: ((params: { durationMs: number }) => Promise<void>) | undefined;
}

export interface AdminAuthTokenRefreshOptions {
  rejectedAuthToken: string;
}

export interface GetOrCreateAdminAuthTokenParams extends AdminAuthTokenCacheParams {
  cacheDurationMs: number;
  createToken: () => Promise<string>;
  forceRefresh?: boolean | AdminAuthTokenRefreshOptions | undefined;
  jwtExpirationSafetySkewMs?: number | undefined;
  validationPolicy?: string | undefined;
  validationTimeoutMs?: number | undefined;
  validateToken?: ((params: ValidateAdminAuthTokenParams) => Promise<boolean>) | undefined;
}

export type InvalidateAdminAuthTokenParams = AdminAuthTokenCacheParams;

export interface InvalidateGeneratedAdminAuthTokenParams extends AdminAuthTokenCacheParams {
  clientName?: string | undefined;
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
  mintedAtMs?: number | undefined;
  validatedAtMs?: number | undefined;
  validationPolicyFingerprint?: string | undefined;
}

interface AdminAuthTokenCachePaths {
  audience: string | undefined;
  cacheDirectoryPath: string;
  cacheFilePath: string;
  cacheKeyFingerprint: string;
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
  const jwtExpirationSafetySkewMs =
    params.jwtExpirationSafetySkewMs ?? DEFAULT_JWT_EXPIRATION_SAFETY_SKEW_MS;
  const validationPolicyFingerprint = getValidationPolicyFingerprint(params);
  const validationTimeoutMs = getValidationTimeoutMs(params);

  await mkdir(cachePaths.cacheDirectoryPath, { recursive: true });

  const cachedEntry =
    typeof params.forceRefresh === "object"
      ? undefined
      : await readCachedEntry({
          cacheFilePath: cachePaths.cacheFilePath,
          jwtExpirationSafetySkewMs,
          nowImplementation,
        });
  if (!isForceRefreshRequested(params)) {
    const needsValidation =
      isDefined(params.validateToken) &&
      cachedEntry?.validationPolicyFingerprint !== validationPolicyFingerprint;
    if (isDefined(cachedEntry) && !needsValidation) {
      emitCacheEvent({
        cachePaths,
        event: {
          kind: "hit",
          ...getCredentialEventMetadata({ storedEntry: cachedEntry }),
          expiresAtMs: cachedEntry.expiresAtMs,
          jwtExpiresAtMs: getJwtExpirationMs({ authToken: cachedEntry.authToken }),
          validatedAtMs: cachedEntry.validatedAtMs,
          validationPolicyFingerprint: cachedEntry.validationPolicyFingerprint,
        },
        onCacheEvent: params.onCacheEvent,
      });
      return getPublicCacheEntry({ storedEntry: cachedEntry });
    }
  }

  return await getOrCreateWithLock({
    ...params,
    cachePaths,
    jwtExpirationSafetySkewMs,
    nowImplementation,
    forceRefreshTargetCredentialFingerprint: getForceRefreshTargetCredentialFingerprint({
      cachedEntry,
      forceRefresh: params.forceRefresh,
    }),
    validationPolicyFingerprint,
    validationTimeoutMs,
  });
}

/**
 * Invalidates one explicitly identified cached token while holding the same
 * cross-process lock used by token readers and writers.
 */
export async function invalidateAdminAuthToken(
  params: InvalidateAdminAuthTokenParams,
): Promise<void> {
  validateCacheLocationParams(params);

  const cachePaths = getCachePaths(params);

  await mkdir(cachePaths.cacheDirectoryPath, { recursive: true });
  await runWithAdminAuthTokenLock({
    ...params,
    cachePaths,
    operation: async () => {
      const cachedEntry = await readCachedEntry({
        cacheFilePath: cachePaths.cacheFilePath,
        jwtExpirationSafetySkewMs: DEFAULT_JWT_EXPIRATION_SAFETY_SKEW_MS,
        nowImplementation: params.nowImplementation ?? Date.now,
      });
      await rm(cachePaths.cacheFilePath, { force: true });
      emitCacheEvent({
        cachePaths,
        event: {
          kind: "invalidated",
          ...getCredentialEventMetadata({ storedEntry: cachedEntry }),
        },
        onCacheEvent: params.onCacheEvent,
      });
    },
  });
}

/**
 * Invalidates a token created by generateAdminAuthToken using the same default
 * cache identity normalization as generation.
 */
export async function invalidateGeneratedAdminAuthToken(
  params: InvalidateGeneratedAdminAuthTokenParams,
): Promise<void> {
  await invalidateAdminAuthToken({
    ...params,
    cacheIdentity: getGeneratedAdminAuthTokenCacheIdentity(params),
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
    cacheIdentity: getGeneratedAdminAuthTokenCacheIdentity(params),
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

            if (isNil(rawToken) || rawToken.length === 0) {
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
    jwtExpirationSafetySkewMs: number;
    nowImplementation: () => number;
    forceRefreshTargetCredentialFingerprint: string | undefined;
    validationPolicyFingerprint: string | undefined;
    validationTimeoutMs: number;
  },
): Promise<AdminAuthTokenCacheEntry> {
  return await runWithAdminAuthTokenLock({
    ...params,
    operation: async () => {
      const cachedEntry = await readCachedEntry({
        cacheFilePath: params.cachePaths.cacheFilePath,
        jwtExpirationSafetySkewMs: params.jwtExpirationSafetySkewMs,
        nowImplementation: params.nowImplementation,
      });
      const refreshesCurrentEntry =
        isForceRefreshRequested(params) &&
        (isDefined(cachedEntry)
          ? getCredentialFingerprint({ authToken: cachedEntry.authToken }) ===
            params.forceRefreshTargetCredentialFingerprint
          : isNil(params.forceRefreshTargetCredentialFingerprint));
      if (refreshesCurrentEntry) {
        await rm(params.cachePaths.cacheFilePath, { force: true });
        emitCacheEvent({
          cachePaths: params.cachePaths,
          event: {
            kind: "refresh",
            ...getCredentialEventMetadata({ storedEntry: cachedEntry }),
          },
          onCacheEvent: params.onCacheEvent,
        });
      } else if (isDefined(cachedEntry)) {
        const needsValidation =
          isDefined(params.validateToken) &&
          cachedEntry.validationPolicyFingerprint !== params.validationPolicyFingerprint;
        const isAccepted = needsValidation
          ? await validateAdminAuthToken({
              authToken: cachedEntry.authToken,
              validationTimeoutMs: params.validationTimeoutMs,
              validateToken: params.validateToken,
            })
          : true;
        if (isAccepted) {
          const acceptedEntry = needsValidation
            ? {
                ...cachedEntry,
                validatedAtMs: params.nowImplementation(),
                validationPolicyFingerprint: params.validationPolicyFingerprint,
              }
            : cachedEntry;
          const expiredDuringValidation = isAdminAuthTokenExpired({
            cacheEntry: acceptedEntry,
            nowMs: params.nowImplementation(),
          });
          if (!expiredDuringValidation) {
            await persistCachedValidation({
              cacheFilePath: params.cachePaths.cacheFilePath,
              needsValidation,
              storedEntry: acceptedEntry,
            });
            emitCacheEvent({
              cachePaths: params.cachePaths,
              event: {
                kind: "hit",
                ...getCredentialEventMetadata({ storedEntry: acceptedEntry }),
                expiresAtMs: acceptedEntry.expiresAtMs,
                jwtExpiresAtMs: getJwtExpirationMs({ authToken: acceptedEntry.authToken }),
                validatedAtMs: acceptedEntry.validatedAtMs,
                validationPolicyFingerprint: acceptedEntry.validationPolicyFingerprint,
              },
              onCacheEvent: params.onCacheEvent,
            });
            return getPublicCacheEntry({ storedEntry: acceptedEntry });
          }

          await rm(params.cachePaths.cacheFilePath, { force: true });
        } else {
          await rm(params.cachePaths.cacheFilePath, { force: true });
          emitCacheEvent({
            cachePaths: params.cachePaths,
            event: {
              kind: "validation-rejected",
              ...getCredentialEventMetadata({ storedEntry: cachedEntry }),
              expiresAtMs: cachedEntry.expiresAtMs,
              jwtExpiresAtMs: getJwtExpirationMs({ authToken: cachedEntry.authToken }),
            },
            onCacheEvent: params.onCacheEvent,
          });
        }
      }

      emitCacheEvent({
        cachePaths: params.cachePaths,
        event: { kind: "miss" },
        onCacheEvent: params.onCacheEvent,
      });

      const authToken = await params.createToken();
      if (!isValidBearerToken(authToken)) {
        throw new Error("Generated admin auth token is malformed");
      }
      const mintedAtMs = params.nowImplementation();
      const credentialFingerprint = getCredentialFingerprint({ authToken });

      const isAccepted = await validateAdminAuthToken({
        authToken,
        validationTimeoutMs: params.validationTimeoutMs,
        validateToken: params.validateToken,
      });
      if (!isAccepted) {
        emitCacheEvent({
          cachePaths: params.cachePaths,
          event: {
            kind: "validation-rejected",
            credentialFingerprint,
            jwtExpiresAtMs: getJwtExpirationMs({ authToken }),
            mintedAtMs,
          },
          onCacheEvent: params.onCacheEvent,
        });
        throw new Error("Generated admin auth token was rejected by validation");
      }

      const nowMs = params.nowImplementation();
      const expiration = getAdminAuthTokenExpiration({
        authToken,
        cacheDurationMs: params.cacheDurationMs,
        jwtExpirationSafetySkewMs: params.jwtExpirationSafetySkewMs,
        nowMs,
      });
      if (expiration.expiresAtMs <= nowMs) {
        throw new Error("Generated admin auth token expires within the configured safety skew");
      }

      const storedEntry = {
        authToken,
        expiresAtMs: expiration.expiresAtMs,
        mintedAtMs,
        validatedAtMs: isDefined(params.validateToken) ? nowMs : undefined,
        validationPolicyFingerprint: params.validationPolicyFingerprint,
      };
      await writeCachedEntry({
        cacheFilePath: params.cachePaths.cacheFilePath,
        storedEntry,
      });
      emitCacheEvent({
        cachePaths: params.cachePaths,
        event: {
          kind: "created",
          ...getCredentialEventMetadata({ storedEntry }),
          expiresAtMs: storedEntry.expiresAtMs,
          jwtExpiresAtMs: expiration.jwtExpiresAtMs,
          validatedAtMs: storedEntry.validatedAtMs,
          validationPolicyFingerprint: storedEntry.validationPolicyFingerprint,
        },
        onCacheEvent: params.onCacheEvent,
      });

      return getPublicCacheEntry({ storedEntry });
    },
  });
}

function validateParams(params: GetOrCreateAdminAuthTokenParams): void {
  validateCacheLocationParams(params);

  if (!Number.isFinite(params.cacheDurationMs) || params.cacheDurationMs <= 0) {
    throw new Error("cacheDurationMs must be positive");
  }

  if (
    isDefined(params.jwtExpirationSafetySkewMs) &&
    (!Number.isFinite(params.jwtExpirationSafetySkewMs) || params.jwtExpirationSafetySkewMs < 0)
  ) {
    throw new Error("jwtExpirationSafetySkewMs must be finite and non-negative");
  }

  if (
    isDefined(params.validateToken) &&
    (isNil(params.validationPolicy) || params.validationPolicy.trim().length === 0)
  ) {
    throw new Error("validationPolicy must be provided when validateToken is configured");
  }

  if (
    isDefined(params.validationTimeoutMs) &&
    (!Number.isFinite(params.validationTimeoutMs) || params.validationTimeoutMs <= 0)
  ) {
    throw new Error("validationTimeoutMs must be positive");
  }

  if (
    typeof params.forceRefresh === "object" &&
    !isValidBearerToken(params.forceRefresh.rejectedAuthToken)
  ) {
    throw new Error("forceRefresh.rejectedAuthToken must be a valid bearer token");
  }
}

function validateCacheLocationParams(params: {
  adminEmail: string;
  apiEnvironmentName: string;
  cacheIdentity?: AdminAuthTokenCacheIdentity | undefined;
}): void {
  if (params.adminEmail.trim().length === 0) {
    throw new Error("adminEmail must not be empty");
  }

  if (params.apiEnvironmentName.trim().length === 0) {
    throw new Error("apiEnvironmentName must not be empty");
  }

  if (params.cacheIdentity?.namespace.trim().length === 0) {
    throw new Error("cacheIdentity.namespace must not be empty");
  }

  if (params.cacheIdentity?.tokenKind.trim().length === 0) {
    throw new Error("cacheIdentity.tokenKind must not be empty");
  }
}

function getGeneratedAdminAuthTokenCacheIdentity(params: {
  cacheIdentity?: AdminAuthTokenCacheIdentity | undefined;
  clientName?: string | undefined;
}): AdminAuthTokenCacheIdentity {
  return {
    namespace: params.cacheIdentity?.namespace ?? "generateAdminAuthToken",
    tokenKind: params.cacheIdentity?.tokenKind ?? "admin-user",
    audience: params.cacheIdentity?.audience,
    clientName: params.clientName ?? params.cacheIdentity?.clientName,
    issuer: params.cacheIdentity?.issuer,
  };
}

function isForceRefreshRequested(
  params: Pick<GetOrCreateAdminAuthTokenParams, "forceRefresh">,
): boolean {
  return isDefined(params.forceRefresh) && params.forceRefresh !== false;
}

function getForceRefreshTargetCredentialFingerprint(params: {
  cachedEntry: StoredAdminAuthTokenCacheEntry | undefined;
  forceRefresh: GetOrCreateAdminAuthTokenParams["forceRefresh"];
}): string | undefined {
  if (!isForceRefreshRequested(params)) {
    return undefined;
  }

  if (typeof params.forceRefresh === "object") {
    return getCredentialFingerprint({ authToken: params.forceRefresh.rejectedAuthToken });
  }

  return isDefined(params.cachedEntry)
    ? getCredentialFingerprint({ authToken: params.cachedEntry.authToken })
    : undefined;
}

function getCachePaths(params: {
  adminEmail: string;
  apiEnvironmentName: string;
  cacheIdentity?: AdminAuthTokenCacheIdentity | undefined;
  cacheDirectory?: string | undefined;
}): AdminAuthTokenCachePaths {
  const cacheDirectoryPath =
    params.cacheDirectory ?? path.join(tmpdir(), DEFAULT_CACHE_DIRECTORY_NAME);
  const environmentSegment = params.apiEnvironmentName.replaceAll(/[^a-zA-Z0-9._-]/g, "_");
  const cacheKeyFingerprint = createDeterministicHash(
    JSON.stringify({
      adminEmail: params.adminEmail,
      apiEnvironmentName: params.apiEnvironmentName,
      cacheIdentity: isNil(params.cacheIdentity)
        ? undefined
        : {
            namespace: params.cacheIdentity.namespace,
            tokenKind: params.cacheIdentity.tokenKind,
            audience: params.cacheIdentity.audience,
            clientName: params.cacheIdentity.clientName,
            issuer: params.cacheIdentity.issuer,
          },
    }),
  ).slice(0, 16);
  const cacheFileName = `admin-auth-token-${environmentSegment}-${cacheKeyFingerprint}.json`;

  return {
    audience: params.cacheIdentity?.audience,
    cacheDirectoryPath,
    cacheFilePath: path.join(cacheDirectoryPath, cacheFileName),
    cacheKeyFingerprint,
    lockFilePath: path.join(cacheDirectoryPath, `${cacheFileName}.lock`),
  };
}

function getCredentialFingerprint(params: { authToken: string }): string {
  return createDeterministicHash(params.authToken).slice(0, 16);
}

function getCredentialEventMetadata(params: {
  storedEntry: StoredAdminAuthTokenCacheEntry | undefined;
}): Pick<AdminAuthTokenCacheEvent, "credentialFingerprint" | "mintedAtMs"> {
  if (isNil(params.storedEntry)) {
    return {};
  }

  return {
    credentialFingerprint: getCredentialFingerprint({ authToken: params.storedEntry.authToken }),
    mintedAtMs: params.storedEntry.mintedAtMs,
  };
}

async function readCachedEntry(params: {
  cacheFilePath: string;
  jwtExpirationSafetySkewMs: number;
  nowImplementation: () => number;
}): Promise<StoredAdminAuthTokenCacheEntry | undefined> {
  try {
    const contents = await readFile(params.cacheFilePath, "utf8");
    const parsed: unknown = JSON.parse(contents);

    if (!isStoredCacheEntry(parsed)) {
      return undefined;
    }

    const nowMs = params.nowImplementation();
    const expiration = getAdminAuthTokenExpiration({
      authToken: parsed.authToken,
      cacheDurationMs: parsed.expiresAtMs - nowMs,
      jwtExpirationSafetySkewMs: params.jwtExpirationSafetySkewMs,
      nowMs,
    });
    if (nowMs >= expiration.expiresAtMs) {
      return undefined;
    }

    return {
      ...parsed,
      expiresAtMs: Math.min(parsed.expiresAtMs, expiration.expiresAtMs),
    };
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
    Number.isFinite(value["expiresAtMs"]) &&
    (isNil(value["mintedAtMs"]) ||
      (typeof value["mintedAtMs"] === "number" && Number.isFinite(value["mintedAtMs"]))) &&
    (isNil(value["validatedAtMs"]) ||
      (typeof value["validatedAtMs"] === "number" && Number.isFinite(value["validatedAtMs"]))) &&
    (isNil(value["validationPolicyFingerprint"]) ||
      typeof value["validationPolicyFingerprint"] === "string")
  );
}

function getPublicCacheEntry(params: {
  storedEntry: StoredAdminAuthTokenCacheEntry;
}): AdminAuthTokenCacheEntry {
  return {
    authToken: params.storedEntry.authToken,
    expiresAtMs: params.storedEntry.expiresAtMs,
  };
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

async function persistCachedValidation(params: {
  cacheFilePath: string;
  needsValidation: boolean;
  storedEntry: StoredAdminAuthTokenCacheEntry;
}): Promise<void> {
  if (!params.needsValidation) {
    return;
  }

  await writeCachedEntry({
    cacheFilePath: params.cacheFilePath,
    storedEntry: params.storedEntry,
  });
}

async function runWithAdminAuthTokenLock<Result>(params: {
  cachePaths: AdminAuthTokenCachePaths;
  lockStaleAfterMs?: number | undefined;
  lockWaitTimeoutMs?: number | undefined;
  lockRetryDelayMs?: number | undefined;
  lockRetryJitterMs?: number | undefined;
  operation: () => Promise<Result>;
  randomImplementation?: (() => number) | undefined;
  sleepImplementation?: ((params: { durationMs: number }) => Promise<void>) | undefined;
}): Promise<Result> {
  const waitStartedAtMs = performance.now();
  const lockWaitTimeoutMs = params.lockWaitTimeoutMs ?? DEFAULT_LOCK_WAIT_TIMEOUT_MS;
  const sleepImplementation = params.sleepImplementation ?? sleep;

  /* eslint-disable no-await-in-loop -- Lock acquisition and ownership checks are sequential. */
  while (performance.now() - waitStartedAtMs < lockWaitTimeoutMs) {
    const lock = await tryAcquireLock({
      lockFilePath: params.cachePaths.lockFilePath,
    });

    if (isDefined(lock)) {
      try {
        return await params.operation();
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

async function tryAcquireLock(params: {
  lockFilePath: string;
}): Promise<AdminAuthTokenLock | undefined> {
  const lock = {
    ownerId: `${process.pid}-${randomUUID()}`,
    createdAtMs: Date.now(),
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
}): Promise<void> {
  try {
    const lock = await readLock(params.lockFilePath);
    const lockFileStats = await stat(params.lockFilePath);
    const lockCreatedAtMs = lock?.createdAtMs ?? lockFileStats.mtimeMs;

    if (Date.now() - lockCreatedAtMs < params.lockStaleAfterMs) {
      return;
    }

    if (isNil(lock)) {
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

async function validateAdminAuthToken(params: {
  authToken: string;
  validationTimeoutMs: number;
  validateToken?: ((params: ValidateAdminAuthTokenParams) => Promise<boolean>) | undefined;
}): Promise<boolean> {
  if (isNil(params.validateToken)) {
    return true;
  }

  const abortController = new AbortController();
  const timeoutAbortController = new AbortController();

  try {
    return await Promise.race([
      params.validateToken({
        authToken: params.authToken,
        signal: abortController.signal,
      }),
      throwAfterAdminAuthTokenValidationTimeout({
        signal: timeoutAbortController.signal,
        timeoutMs: params.validationTimeoutMs,
      }),
    ]);
  } finally {
    abortController.abort();
    timeoutAbortController.abort();
  }
}

async function throwAfterAdminAuthTokenValidationTimeout(params: {
  signal: AbortSignal;
  timeoutMs: number;
}): Promise<never> {
  await setTimeoutPromise(params.timeoutMs, undefined, { signal: params.signal });
  throw new Error(`Admin auth token validation timed out after ${params.timeoutMs}ms`);
}

function getValidationPolicyFingerprint(
  params: Pick<GetOrCreateAdminAuthTokenParams, "validateToken" | "validationPolicy">,
): string | undefined {
  return isDefined(params.validateToken) && isDefined(params.validationPolicy)
    ? createDeterministicHash(params.validationPolicy).slice(0, 16)
    : undefined;
}

function getValidationTimeoutMs(
  params: Pick<GetOrCreateAdminAuthTokenParams, "lockStaleAfterMs" | "validationTimeoutMs">,
): number {
  const lockStaleAfterMs = params.lockStaleAfterMs ?? DEFAULT_LOCK_STALE_AFTER_MS;

  return Math.min(
    params.validationTimeoutMs ?? DEFAULT_VALIDATION_TIMEOUT_MS,
    Math.max(1, Math.floor(lockStaleAfterMs / 2)),
  );
}

function getAdminAuthTokenExpiration(params: {
  authToken: string;
  cacheDurationMs: number;
  jwtExpirationSafetySkewMs: number;
  nowMs: number;
}): {
  expiresAtMs: number;
  jwtExpiresAtMs: number | undefined;
} {
  const jwtExpiresAtMs = getJwtExpirationMs({ authToken: params.authToken });
  const configuredExpiresAtMs = params.nowMs + params.cacheDurationMs;
  const jwtCacheExpiresAtMs = isNil(jwtExpiresAtMs)
    ? Number.POSITIVE_INFINITY
    : jwtExpiresAtMs - params.jwtExpirationSafetySkewMs;

  return {
    expiresAtMs: Math.min(configuredExpiresAtMs, jwtCacheExpiresAtMs),
    jwtExpiresAtMs,
  };
}

function getJwtExpirationMs(params: { authToken: string }): number | undefined {
  const rawToken = params.authToken.slice(BEARER_TOKEN_PREFIX.length);
  const tokenSegments = rawToken.split(".");
  if (tokenSegments.length !== 3) {
    return undefined;
  }

  const [, encodedPayload] = tokenSegments;
  if (isNil(encodedPayload)) {
    return undefined;
  }

  try {
    const payload: unknown = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8"));
    const expirationSeconds = isRecord(payload) ? payload["exp"] : undefined;

    return typeof expirationSeconds === "number" && Number.isFinite(expirationSeconds)
      ? expirationSeconds * 1000
      : undefined;
  } catch {
    return undefined;
  }
}

function emitCacheEvent(params: {
  cachePaths: AdminAuthTokenCachePaths;
  event: Omit<AdminAuthTokenCacheEvent, "audience" | "cacheKeyFingerprint">;
  onCacheEvent?: AdminAuthTokenCacheEventHandler | undefined;
}): void {
  try {
    const callbackResult = params.onCacheEvent?.({
      ...params.event,
      audience: params.cachePaths.audience,
      cacheKeyFingerprint: params.cachePaths.cacheKeyFingerprint,
    });
    if (callbackResult instanceof Promise) {
      void ignoreRejectedCacheEventCallback({ callbackResult });
    }
  } catch {
    // Diagnostics must never block token creation or cache access.
  }
}

async function ignoreRejectedCacheEventCallback(params: {
  callbackResult: Promise<void>;
}): Promise<void> {
  try {
    await params.callbackResult;
  } catch {
    // Diagnostics must never block token creation or cache access.
  }
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

  if (isDefined(params.clientName)) {
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
