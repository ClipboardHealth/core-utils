import { either as E } from "@clipboard-health/util-ts";
import { type SafeParseReturnType } from "zod";

import { ServiceError, type ServiceErrorParams, toZodIssue } from "../errors/serviceError";

/**
 * Represents the result of a service operation that may fail.
 * @template A The type of the successful result value
 */
export type ServiceResult<A> = E.Either<ServiceError, A>;

/**
 * Creates a successful `ServiceResult` containing the provided value.
 *
 * @template A The type of the success value
 * @param value The value to wrap in a successful result
 * @returns A `ServiceResult` containing the success value
 */
export function success<A>(value: A): ServiceResult<A> {
  return E.right(value);
}

/**
 * Creates a failed `ServiceResult` containing a `ServiceError`.
 *
 * @template A The type of the success value
 * @param params The parameters to create the `ServiceError`
 * @returns A `ServiceResult` containing the error
 */
export function failure<A = never>(params: ServiceErrorParams | ServiceError): ServiceResult<A> {
  return E.left(params instanceof ServiceError ? params : new ServiceError(params));
}

export function fromSafeParseReturnType<A>(
  value: SafeParseReturnType<unknown, A>,
): ServiceResult<A> {
  return value.success
    ? success(value.data)
    : failure({ issues: value.error.issues.map(toZodIssue) });
}
