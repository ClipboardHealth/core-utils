import {
  type ErrorCode,
  type FailureResult,
  isFailure,
  type ServiceResult,
} from "@clipboard-health/util-ts";

import { type TriggerResponse } from "./types";

/**
 * Checks if a result contains specific error codes and is a failure result.
 *
 * @param result - Either containing a ServiceError (failure) or T (success)
 * @param errorCodes - Array of error codes to check for. If empty, any error will match.
 */
export function errorsInResult<T = TriggerResponse>(
  result: ServiceResult<T>,
  errorCodes: ErrorCode[] = [],
): result is FailureResult {
  return (
    isFailure(result) &&
    (errorCodes.length === 0 ||
      result.error.issues.some((issue) => errorCodes.includes(issue.code)))
  );
}
