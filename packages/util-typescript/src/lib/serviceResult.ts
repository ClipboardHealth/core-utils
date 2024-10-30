import { either as E } from "@clipboard-health/util-typescript";

import { ServiceError, type ServiceErrorParams } from "./errors/serviceError";

/**
 * Type alias for `Either` with `ServiceError` as `Left`
 */
export type ServiceResult<A> = E.Either<ServiceError, A>;

/**
 * Creates a `ServiceResult` with a success value
 */
export function success<A>(value: A): ServiceResult<A> {
  return E.right(value);
}

/**
 * Creates a `ServiceResult` with an error
 */
export function failure<A = never>(params: ServiceErrorParams): ServiceResult<A> {
  return E.left(new ServiceError(params));
}
