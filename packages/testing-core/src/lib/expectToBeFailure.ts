import { type either as E, type ServiceError, type ServiceResult } from "@clipboard-health/util-ts";

import { expectToBeLeft } from "./expectToBeLeft";

/**
 * Asserts and narrows the type of the provided ServiceResult value to Failure (Left with ServiceError).
 * @param value - The ServiceResult value to check
 * @throws {AssertionError} If the value is undefined or not a Failure
 */
export function expectToBeFailure<A>(
  value: ServiceResult<A> | undefined,
): asserts value is E.Left<ServiceError> {
  expectToBeLeft(value);
}
