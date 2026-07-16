import { performance } from "node:perf_hooks";

import { isDefined, isRecord, toErrorMessage as getErrorMessage } from "@clipboard-health/util-ts";

import { RetryError, runWithRetry } from "./retry";
import { isRetryableHttpStatus } from "./setupRetry";

const DEFAULT_CONCURRENCY_LIMIT = 5;
const DEFAULT_FETCH_TIMEOUT_MS = 10_000;
const DEFAULT_RETRY_ATTEMPTS = 3;
const DEFAULT_RETRY_DELAY_MS = 500;
const DEFAULT_POLL_INTERVAL_MS = 10_000;
const CACHE_BUST_QUERY_PARAMETER = "cbhAssetVerifier";

export type DeployedAssetRequestMethod = "GET" | "HEAD";
export type DeployedAssetCacheMode = "cache-busted" | "normal";

export interface DeployedAssetValidationResult {
  isValid: boolean;
  message?: string | undefined;
  isTransient?: boolean | undefined;
}

export interface DeployedAssetCheck {
  path: string;
  url: string;
  method?: DeployedAssetRequestMethod | undefined;
  cacheMode?: DeployedAssetCacheMode | undefined;
  expectedContentTypes?: readonly string[] | undefined;
  headers?: Record<string, string> | undefined;
  validateResponse?:
    | ((params: {
        response: Response;
      }) => Promise<DeployedAssetValidationResult> | DeployedAssetValidationResult)
    | undefined;
}

export interface DeployedAssetAttempt {
  attemptNumber: number;
  contentType?: string | undefined;
  durationMs: number;
  errorMessage?: string | undefined;
  status?: number | undefined;
  url: string;
}

export type DeployedAssetReportCheck = Omit<DeployedAssetCheck, "headers" | "validateResponse">;

export interface DeployedAssetResult {
  attempts: DeployedAssetAttempt[];
  check: DeployedAssetReportCheck;
  contentType?: string | undefined;
  errorMessage?: string | undefined;
  isSuccess: boolean;
  status?: number | undefined;
}

export interface DeployedAssetVerificationReport {
  results: DeployedAssetResult[];
  summary: {
    failureCount: number;
    passedCount: number;
    totalCount: number;
  };
  wait?:
    | {
        attempts: number;
        isStableWindowSatisfied: boolean;
        stableWindowElapsedMs: number;
      }
    | undefined;
}

export interface VerifyDeployedAssetsParams {
  checks: readonly DeployedAssetCheck[];
  concurrencyLimit?: number | undefined;
  fetchImplementation?: typeof fetch | undefined;
  fetchTimeoutMs?: number | undefined;
  nowImplementation?: (() => number) | undefined;
  retry?:
    | {
        maxAttempts?: number | undefined;
        delayMs?: number | undefined;
      }
    | undefined;
  sleepImplementation?: ((params: { durationMs: number }) => Promise<void>) | undefined;
}

export interface WaitForDeployedAssetsParams extends VerifyDeployedAssetsParams {
  timeoutMs: number;
  pollIntervalMs?: number | undefined;
  stableWindowMs?: number | undefined;
}

interface AssetAttemptFailureParams {
  attempt: DeployedAssetAttempt;
  isTransient: boolean;
  message: string;
}

class AssetAttemptFailure extends Error {
  public readonly attempt: DeployedAssetAttempt;
  public readonly isTransient: boolean;

  public constructor(params: AssetAttemptFailureParams) {
    super(params.message);
    this.name = "AssetAttemptFailure";
    this.attempt = params.attempt;
    this.isTransient = params.isTransient;
  }
}

class AssetGraphNotReadyError extends Error {}

/**
 * Checks a repo-supplied deployed asset graph with bounded concurrency and
 * classified per-asset retries. Discovery and asset classification remain in
 * thin repo wrappers.
 */
export async function verifyDeployedAssets(
  params: VerifyDeployedAssetsParams,
): Promise<DeployedAssetVerificationReport> {
  const concurrencyLimit = params.concurrencyLimit ?? DEFAULT_CONCURRENCY_LIMIT;
  if (!Number.isInteger(concurrencyLimit) || concurrencyLimit < 1) {
    throw new Error("concurrencyLimit must be a positive integer");
  }

  const results: Array<DeployedAssetResult | undefined> = Array.from({
    length: params.checks.length,
  });
  let nextIndex = 0;

  async function worker(): Promise<void> {
    for (;;) {
      const index = nextIndex;
      nextIndex += 1;

      if (index >= params.checks.length) {
        return;
      }

      const check = params.checks[index];
      if (check === undefined) {
        return;
      }

      // eslint-disable-next-line no-await-in-loop -- Each worker consumes one bounded queue item at a time.
      results[index] = await verifyDeployedAsset({ check, options: params });
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrencyLimit, params.checks.length) }, worker),
  );

  const completedResults = results.filter(isDefined);
  const failureCount = completedResults.filter((result) => !result.isSuccess).length;

  return {
    results: completedResults,
    summary: {
      failureCount,
      passedCount: completedResults.length - failureCount,
      totalCount: completedResults.length,
    },
  };
}

/**
 * Polls the whole graph until it is healthy for an optional stable window.
 */
export async function waitForDeployedAssets(
  params: WaitForDeployedAssetsParams,
): Promise<DeployedAssetVerificationReport> {
  const nowImplementation = params.nowImplementation ?? Date.now;
  const stableWindowMs = params.stableWindowMs ?? 0;
  let stableWindowStartedAtMs: number | undefined;
  let lastReport: DeployedAssetVerificationReport | undefined;

  const result = await runWithRetry({
    operationName: "wait for deployed asset graph",
    operation: async () => {
      lastReport = await verifyDeployedAssets(params);
      const nowMs = nowImplementation();

      if (lastReport.summary.failureCount > 0) {
        stableWindowStartedAtMs = undefined;
        throw new AssetGraphNotReadyError(
          `Deployed asset graph has ${lastReport.summary.failureCount} failure(s)`,
        );
      }

      stableWindowStartedAtMs ??= nowMs;
      const stableWindowElapsedMs = nowMs - stableWindowStartedAtMs;

      if (stableWindowElapsedMs < stableWindowMs) {
        throw new AssetGraphNotReadyError(
          `Deployed asset graph is healthy for ${stableWindowElapsedMs}ms; ` +
            `${stableWindowMs}ms required`,
        );
      }

      return {
        report: lastReport,
        stableWindowElapsedMs,
      };
    },
    mode: {
      kind: "poll",
      timeoutMs: params.timeoutMs,
      intervalsMs: [params.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS],
      isTransient: ({ error }) => error instanceof AssetGraphNotReadyError,
    },
    nowImplementation,
    sleepImplementation: params.sleepImplementation,
  });

  return {
    ...result.value.report,
    wait: {
      attempts: result.attempts,
      isStableWindowSatisfied: true,
      stableWindowElapsedMs: result.value.stableWindowElapsedMs,
    },
  };
}

async function verifyDeployedAsset(params: {
  check: DeployedAssetCheck;
  options: VerifyDeployedAssetsParams;
}): Promise<DeployedAssetResult> {
  const attempts: DeployedAssetAttempt[] = [];
  const maxAttempts = params.options.retry?.maxAttempts ?? DEFAULT_RETRY_ATTEMPTS;
  const reportCheck = toDeployedAssetReportCheck(params.check);

  try {
    const result = await runWithRetry<DeployedAssetAttempt>({
      operationName: `verify deployed asset ${params.check.path}`,
      operation: async ({ attemptNumber }) => {
        try {
          const attempt = await checkAssetOnce({
            attemptNumber,
            check: params.check,
            fetchImplementation: params.options.fetchImplementation ?? fetch,
            fetchTimeoutMs: params.options.fetchTimeoutMs ?? DEFAULT_FETCH_TIMEOUT_MS,
            nowImplementation: params.options.nowImplementation ?? (() => performance.now()),
          });
          attempts.push(attempt);
          return attempt;
        } catch (error: unknown) {
          if (error instanceof AssetAttemptFailure) {
            attempts.push(error.attempt);
          }

          throw error;
        }
      },
      mode: {
        kind: "classified",
        maxAttempts,
        delayMs: params.options.retry?.delayMs ?? DEFAULT_RETRY_DELAY_MS,
        isTransient: ({ error }) => error instanceof AssetAttemptFailure && error.isTransient,
      },
      sleepImplementation: params.options.sleepImplementation,
      nowImplementation: params.options.nowImplementation,
    });
    const finalAttempt = result.value;

    return {
      attempts,
      check: reportCheck,
      ...(finalAttempt.contentType === undefined ? {} : { contentType: finalAttempt.contentType }),
      isSuccess: true,
      ...(finalAttempt.status === undefined ? {} : { status: finalAttempt.status }),
    };
  } catch (error: unknown) {
    const failure = getAssetAttemptFailure({ error });
    const finalAttempt = attempts.at(-1);

    return {
      attempts,
      check: reportCheck,
      ...(finalAttempt?.contentType === undefined ? {} : { contentType: finalAttempt.contentType }),
      errorMessage: failure?.message ?? getErrorMessage(error),
      isSuccess: false,
      ...(finalAttempt?.status === undefined ? {} : { status: finalAttempt.status }),
    };
  }
}

async function checkAssetOnce(params: {
  attemptNumber: number;
  check: DeployedAssetCheck;
  fetchImplementation: typeof fetch;
  fetchTimeoutMs: number;
  nowImplementation: () => number;
}): Promise<DeployedAssetAttempt> {
  const requestUrl = getRequestUrl({
    attemptNumber: params.attemptNumber,
    check: params.check,
  });
  const abortController = new AbortController();
  const timeout = setTimeout(() => {
    abortController.abort();
  }, params.fetchTimeoutMs);
  const startedAtMs = params.nowImplementation();

  try {
    let response: Response;

    try {
      response = await params.fetchImplementation(requestUrl, {
        ...getRequestInit({ check: params.check }),
        method: params.check.method ?? "GET",
        signal: abortController.signal,
      });
    } catch (error: unknown) {
      const message = getErrorMessage(error);
      throw new AssetAttemptFailure({
        attempt: {
          attemptNumber: params.attemptNumber,
          durationMs: params.nowImplementation() - startedAtMs,
          errorMessage: message,
          url: requestUrl,
        },
        isTransient: isTransientFetchError({ error }),
        message,
      });
    }

    const contentType = response.headers.get("content-type") ?? undefined;
    const attempt: DeployedAssetAttempt = {
      attemptNumber: params.attemptNumber,
      ...(contentType === undefined ? {} : { contentType }),
      durationMs: params.nowImplementation() - startedAtMs,
      status: response.status,
      url: requestUrl,
    };

    if (!response.ok) {
      const message = `expected HTTP 2xx but received HTTP ${response.status}`;
      throw new AssetAttemptFailure({
        attempt: { ...attempt, errorMessage: message },
        isTransient: isTransientAssetStatus({ status: response.status }),
        message,
      });
    }

    if (
      params.check.expectedContentTypes !== undefined &&
      !isExpectedContentType({
        actualContentType: contentType,
        expectedContentTypes: params.check.expectedContentTypes,
      })
    ) {
      const message =
        `expected content-type ${params.check.expectedContentTypes.join(" or ")} ` +
        `but received ${contentType ?? "none"}`;
      throw new AssetAttemptFailure({
        attempt: { ...attempt, errorMessage: message },
        isTransient: false,
        message,
      });
    }

    if (params.check.validateResponse !== undefined) {
      let validation: DeployedAssetValidationResult;

      try {
        validation = await params.check.validateResponse({ response });
      } catch (error: unknown) {
        const message = getErrorMessage(error);
        throw new AssetAttemptFailure({
          attempt: { ...attempt, errorMessage: message },
          isTransient: isTransientFetchError({ error }),
          message,
        });
      }

      if (!validation.isValid) {
        const message = validation.message ?? "custom deployed asset validation failed";
        throw new AssetAttemptFailure({
          attempt: { ...attempt, errorMessage: message },
          isTransient: validation.isTransient ?? false,
          message,
        });
      }
    }

    return attempt;
  } finally {
    clearTimeout(timeout);
  }
}

function getRequestUrl(params: { attemptNumber: number; check: DeployedAssetCheck }): string {
  const url = new URL(params.check.url);

  if ((params.check.cacheMode ?? "normal") === "normal") {
    return url.toString();
  }

  url.searchParams.set(CACHE_BUST_QUERY_PARAMETER, `${Date.now()}-${params.attemptNumber}`);

  return url.toString();
}

function getRequestInit(params: { check: DeployedAssetCheck }): RequestInit {
  if ((params.check.cacheMode ?? "normal") === "normal") {
    return params.check.headers === undefined ? {} : { headers: params.check.headers };
  }

  return {
    cache: "no-store",
    headers: {
      "cache-control": "no-cache",
      pragma: "no-cache",
      ...params.check.headers,
    },
  };
}

function isTransientAssetStatus(params: { status: number }): boolean {
  return params.status === 425 || isRetryableHttpStatus({ status: params.status });
}

function isTransientFetchError(params: { error: unknown }): boolean {
  const inspectedErrors = new Set<unknown>();
  let error = params.error;

  while (isRecord(error) && !inspectedErrors.has(error)) {
    inspectedErrors.add(error);

    if (
      error["name"] === "AbortError" ||
      error["code"] === "ECONNREFUSED" ||
      error["code"] === "ECONNRESET" ||
      error["code"] === "EAI_AGAIN" ||
      error["code"] === "ENOTFOUND" ||
      error["code"] === "ETIMEDOUT"
    ) {
      return true;
    }

    error = error["cause"];
  }

  const normalizedMessage = getErrorMessage(params.error).toLowerCase();
  return (
    normalizedMessage.includes("failed to fetch") ||
    normalizedMessage.includes("fetch failed") ||
    normalizedMessage.includes("networkerror")
  );
}

function isExpectedContentType(params: {
  actualContentType: string | undefined;
  expectedContentTypes: readonly string[];
}): boolean {
  if (params.actualContentType === undefined) {
    return false;
  }

  const actualContentType = normalizeContentType(params.actualContentType);
  const expectedContentTypes = params.expectedContentTypes.flatMap(getEquivalentContentTypes);

  return expectedContentTypes.includes(actualContentType);
}

function getEquivalentContentTypes(contentType: string): string[] {
  const normalized = normalizeContentType(contentType);

  if (normalized === "application/javascript" || normalized === "text/javascript") {
    return ["application/javascript", "text/javascript"];
  }

  if (normalized === "application/json" || normalized === "application/manifest+json") {
    return ["application/json", "application/manifest+json"];
  }

  if (normalized === "image/x-icon" || normalized === "image/vnd.microsoft.icon") {
    return ["image/x-icon", "image/vnd.microsoft.icon"];
  }

  return [normalized];
}

function toDeployedAssetReportCheck(check: DeployedAssetCheck): DeployedAssetReportCheck {
  return {
    path: check.path,
    url: check.url,
    ...(check.method === undefined ? {} : { method: check.method }),
    ...(check.cacheMode === undefined ? {} : { cacheMode: check.cacheMode }),
    ...(check.expectedContentTypes === undefined
      ? {}
      : { expectedContentTypes: check.expectedContentTypes }),
  };
}

function normalizeContentType(contentType: string): string {
  return contentType.split(";")[0]?.trim().toLowerCase() ?? "";
}

function getAssetAttemptFailure(params: { error: unknown }): AssetAttemptFailure | undefined {
  if (params.error instanceof AssetAttemptFailure) {
    return params.error;
  }

  if (params.error instanceof RetryError && params.error.cause instanceof AssetAttemptFailure) {
    return params.error.cause;
  }

  return undefined;
}
