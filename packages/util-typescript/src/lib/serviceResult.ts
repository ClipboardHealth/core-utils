import { either as E } from "@clipboard-health/util-typescript";

import { ServiceError, type ServiceErrorParams } from "./errors/serviceError";

/**
 * Type alias for `Either` with `ServiceError` as `Left`
 */
export type ServiceResult<T> = E.Either<ServiceError, T>;

/**
 * Creates a `ServiceResult` with a success value
 */
export function success<T>(value: T): ServiceResult<T> {
  return E.right(value);
}

/**
 * Creates a `ServiceResult` with an error
 */
export function failure(params: ServiceErrorParams): ServiceResult<never> {
  return E.left(new ServiceError(params));
}
