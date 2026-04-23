import { toError } from "@clipboard-health/util-ts";

import { ERROR_CODES, type ErrorCode } from "../errorCodes";

const RATE_LIMITED_STATUS = 429;
const MINIMUM_CLIENT_ERROR_STATUS = 400;
const MAXIMUM_CLIENT_ERROR_STATUS = 499;

/**
 * Maps a caught error to a notification {@link ErrorCode} and message so that callers can
 * decide whether retrying makes sense. A 429 is surfaced as {@link ERROR_CODES.rateLimited}
 * (retry with backoff), other 4xx responses as {@link ERROR_CODES.clientError} (not
 * retryable), and everything else as {@link ERROR_CODES.unknown}.
 */
export function toNotificationError(maybeError: unknown): {
  code: ErrorCode;
  error: Error;
  message: string;
} {
  const error = toError(maybeError);
  const status = "status" in error && typeof error.status === "number" ? error.status : undefined;

  if (status === RATE_LIMITED_STATUS) {
    return { code: ERROR_CODES.rateLimited, error, message: error.message };
  }

  if (
    status !== undefined &&
    status >= MINIMUM_CLIENT_ERROR_STATUS &&
    status <= MAXIMUM_CLIENT_ERROR_STATUS
  ) {
    return { code: ERROR_CODES.clientError, error, message: error.message };
  }

  return { code: ERROR_CODES.unknown, error, message: error.message };
}
