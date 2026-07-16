import { toErrorMessage as getErrorMessage } from "@clipboard-health/util-ts";

export type RetryFailureReason = "attempts-exhausted" | "non-transient" | "timeout";

export interface RetryAttemptContext {
  attemptNumber: number;
  elapsedMs: number;
  signal: AbortSignal;
}

export interface RetryFailureContext extends RetryAttemptContext {
  error: unknown;
}

export interface ClassifiedRetryMode {
  kind: "classified";
  maxAttempts: number;
  delayMs?: number | ((context: RetryFailureContext) => number) | undefined;
  isTransient: (context: RetryFailureContext) => boolean;
}

export interface PollRetryMode {
  kind: "poll";
  timeoutMs: number;
  intervalsMs?: readonly number[] | undefined;
  isTransient?: ((context: RetryFailureContext) => boolean) | undefined;
}

export type RetryMode = ClassifiedRetryMode | PollRetryMode;

export interface RetrySuccess<T> {
  value: T;
  attempts: number;
}

export interface RunWithRetryParams<T> {
  operationName: string;
  operation: (context: RetryAttemptContext) => Promise<T>;
  mode: RetryMode;
  nowImplementation?: (() => number) | undefined;
  sleepImplementation?: ((params: { durationMs: number }) => Promise<void>) | undefined;
  onFailedAttempt?: ((context: RetryFailureContext) => void | Promise<void>) | undefined;
}

interface RetryErrorParams {
  operationName: string;
  attempts: number;
  elapsedMs: number;
  reason: RetryFailureReason;
  cause: unknown;
}

class PollAttemptTimeoutError extends Error {
  public constructor() {
    super("Poll attempt exceeded the remaining timeout budget");
    this.name = "PollAttemptTimeoutError";
  }
}

/**
 * Rich terminal error for both retry modes.
 *
 * `reason` distinguishes deterministic bail-out, attempt exhaustion, and poll
 * timeout while `cause` retains the last operation error.
 */
export class RetryError extends Error {
  public readonly attempts: number;
  public override readonly cause: unknown;
  public readonly elapsedMs: number;
  public readonly operationName: string;
  public readonly reason: RetryFailureReason;

  public constructor(params: RetryErrorParams) {
    super(formatRetryErrorMessage(params), { cause: params.cause });
    this.name = "RetryError";
    this.attempts = params.attempts;
    this.cause = params.cause;
    this.elapsedMs = params.elapsedMs;
    this.operationName = params.operationName;
    this.reason = params.reason;
  }
}

/**
 * Runs one bounded retry policy.
 *
 * Classified mode is for operations where the caller can positively identify
 * transient failures. Poll mode is for idempotent readiness probes where every
 * failure means "not ready yet" until the timeout expires.
 */
export async function runWithRetry<T>(params: RunWithRetryParams<T>): Promise<RetrySuccess<T>> {
  validateRetryMode(params.mode);

  const nowImplementation = params.nowImplementation ?? Date.now;
  const sleepImplementation = params.sleepImplementation ?? sleep;
  const startedAtMs = nowImplementation();
  let attemptNumber = 0;
  let lastError: unknown;

  for (;;) {
    const elapsedBeforeAttemptMs = getElapsedMs({
      nowImplementation,
      startedAtMs,
    });

    if (
      params.mode.kind === "poll" &&
      attemptNumber > 0 &&
      elapsedBeforeAttemptMs >= params.mode.timeoutMs
    ) {
      throw new RetryError({
        operationName: params.operationName,
        attempts: attemptNumber,
        elapsedMs: elapsedBeforeAttemptMs,
        reason: "timeout",
        cause: lastError,
      });
    }

    attemptNumber += 1;
    const abortController = new AbortController();

    try {
      // eslint-disable-next-line no-await-in-loop -- Retry attempts are intentionally sequential.
      const value = await runAttempt({
        context: {
          attemptNumber,
          elapsedMs: elapsedBeforeAttemptMs,
          signal: abortController.signal,
        },
        mode: params.mode,
        operation: params.operation,
        abortController,
      });
      return { value, attempts: attemptNumber };
    } catch (error: unknown) {
      lastError = error;
      const failureContext = {
        attemptNumber,
        elapsedMs: getElapsedMs({ nowImplementation, startedAtMs }),
        error,
        signal: abortController.signal,
      };
      // eslint-disable-next-line no-await-in-loop -- Attempt reporting is intentionally sequential.
      await params.onFailedAttempt?.(failureContext);

      const terminalReason = getTerminalReason({
        context: failureContext,
        mode: params.mode,
      });
      if (terminalReason !== undefined) {
        throw new RetryError({
          operationName: params.operationName,
          attempts: attemptNumber,
          elapsedMs: failureContext.elapsedMs,
          reason: terminalReason,
          cause: error,
        });
      }

      const durationMs = getRetryDelayMs({
        context: failureContext,
        mode: params.mode,
      });
      // eslint-disable-next-line no-await-in-loop -- Retry attempts are intentionally sequential.
      await sleepImplementation({ durationMs });
    }
  }
}

function validateRetryMode(mode: RetryMode): void {
  if (mode.kind === "classified") {
    if (!Number.isInteger(mode.maxAttempts) || mode.maxAttempts < 1) {
      throw new Error("Classified retry maxAttempts must be a positive integer");
    }

    if (typeof mode.delayMs === "number" && mode.delayMs < 0) {
      throw new Error("Classified retry delayMs must be non-negative");
    }

    return;
  }

  if (!Number.isFinite(mode.timeoutMs) || mode.timeoutMs <= 0) {
    throw new Error("Poll retry timeoutMs must be positive");
  }

  if (mode.intervalsMs?.some((intervalMs) => intervalMs < 0) === true) {
    throw new Error("Poll retry intervalsMs must be non-negative");
  }
}

function getTerminalReason(params: {
  context: RetryFailureContext;
  mode: RetryMode;
}): RetryFailureReason | undefined {
  if (params.mode.kind === "classified") {
    if (!params.mode.isTransient(params.context)) {
      return "non-transient";
    }

    return params.context.attemptNumber >= params.mode.maxAttempts
      ? "attempts-exhausted"
      : undefined;
  }

  if (params.context.error instanceof PollAttemptTimeoutError) {
    return "timeout";
  }

  if (params.mode.isTransient?.(params.context) === false) {
    return "non-transient";
  }

  return params.context.elapsedMs >= params.mode.timeoutMs ? "timeout" : undefined;
}

async function runAttempt<T>(params: {
  abortController: AbortController;
  context: RetryAttemptContext;
  mode: RetryMode;
  operation: (context: RetryAttemptContext) => Promise<T>;
}): Promise<T> {
  const operationPromise = params.operation(params.context);

  if (params.mode.kind === "classified") {
    return await operationPromise;
  }

  const remainingTimeoutMs = Math.max(params.mode.timeoutMs - params.context.elapsedMs, 0);
  let timeout: ReturnType<typeof setTimeout> | undefined;

  try {
    return await Promise.race([
      operationPromise,
      new Promise<T>((_resolve, reject) => {
        timeout = setTimeout(() => {
          params.abortController.abort();
          reject(new PollAttemptTimeoutError());
        }, remainingTimeoutMs);
      }),
    ]);
  } finally {
    if (timeout !== undefined) {
      clearTimeout(timeout);
    }
  }
}

function getRetryDelayMs(params: { context: RetryFailureContext; mode: RetryMode }): number {
  if (params.mode.kind === "classified") {
    return typeof params.mode.delayMs === "function"
      ? params.mode.delayMs(params.context)
      : (params.mode.delayMs ?? 0);
  }

  const intervalsMs = params.mode.intervalsMs ?? [100, 250, 500, 1000];
  const intervalIndex = Math.min(params.context.attemptNumber - 1, intervalsMs.length - 1);
  const configuredDelayMs = intervalsMs[intervalIndex] ?? 0;
  const remainingMs = Math.max(params.mode.timeoutMs - params.context.elapsedMs, 0);

  return Math.min(configuredDelayMs, remainingMs);
}

function getElapsedMs(params: { nowImplementation: () => number; startedAtMs: number }): number {
  return Math.max(params.nowImplementation() - params.startedAtMs, 0);
}

async function sleep(params: { durationMs: number }): Promise<void> {
  await new Promise<void>((resolve) => {
    setTimeout(resolve, params.durationMs);
  });
}

function formatRetryErrorMessage(params: RetryErrorParams): string {
  return (
    `${params.operationName} failed after ${params.attempts} ` +
    `${params.attempts === 1 ? "attempt" : "attempts"} ` +
    `(${params.elapsedMs}ms, reason: ${params.reason}). ` +
    `Last error: ${getErrorMessage(params.cause)}`
  );
}
