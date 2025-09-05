import { type either as E, type ServiceError, type ServiceResult } from "@clipboard-health/util-ts";

import { expectToBeLeft } from "./expectToBeLeft";

/**
 * Alias for {@link expectToBeLeft}
 */
export function expectToBeFailure<A>(
  value: ServiceResult<A> | undefined,
): asserts value is E.Left<ServiceError> {
  expectToBeLeft(value);
}
