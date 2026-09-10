import {
  type ErrorCode,
  type FailureResult,
  isSuccess,
  type ServiceError,
  type ServiceResult,
} from "@clipboard-health/util-ts";

import type { TriggerResponse } from "./types";

/**
 * Checks if a result contains specific error codes and is a failure result.
 *
 * @param result - ServiceResult containing an error or T.
 * @param errorCodes - Array of error codes to check for. If empty, any error will match.
 */
export function errorsInResult<T = TriggerResponse, ErrorType extends ServiceError = ServiceError>(
  result: ServiceResult<T, ErrorType>,
  errorCodes: ErrorCode[] = [],
): result is FailureResult<ErrorType> {
  if (isSuccess(result)) {
    return false;
  }

  return (
    errorCodes.length === 0 || result.error.issues.some((issue) => errorCodes.includes(issue.code))
  );
}
