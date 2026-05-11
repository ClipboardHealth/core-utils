import { ERROR_CODES } from "./errorCodes";

/**
 * Error codes whose failures are caused by a broken request rather than a transient
 * provider/infrastructure problem. Retrying without changing the request will not help.
 *
 * Consumers (e.g. a background job that wraps {@link NotificationClient.triggerChunked})
 * should short-circuit on these to avoid wasted retries — log loudly and stop, rather than
 * letting the retry framework exhaust its budget.
 *
 * Excludes:
 * - `expired`: handle separately; the request was once valid and is now stale.
 * - `rateLimited`: transient; retry with backoff.
 * - `unknown`: assume transient (network blip, 5xx, etc.) and retry.
 */
const CLIENT_ERROR_CODES = new Set<string>([
  ERROR_CODES.clientError,
  ERROR_CODES.invalidExpiresAt,
  ERROR_CODES.invalidIdempotencyKey,
  ERROR_CODES.missingSigningKey,
  ERROR_CODES.recipientCountAboveMaximum,
  ERROR_CODES.recipientCountBelowMinimum,
]);

/**
 * Returns `true` when `code` indicates the request itself is broken and retrying without
 * changes is unlikely to succeed. Consumers should treat these as non-retryable: log at
 * ERROR and stop, rather than rethrowing into a retry framework.
 *
 * @example
 * ```ts
 * if (isFailure(result)) {
 *   const code = result.error.issues[0]?.code;
 *   if (isClientError(code)) {
 *     logger.error("Notification failed with client error; not retrying", { code });
 *     return;
 *   }
 *   throw result.error;
 * }
 * ```
 */
export function isClientError(code: string | undefined): boolean {
  if (code === undefined) {
    return false;
  }

  return CLIENT_ERROR_CODES.has(code);
}
