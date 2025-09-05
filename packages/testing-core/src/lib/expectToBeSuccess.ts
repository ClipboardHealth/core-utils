import { type either as E, type ServiceResult } from "@clipboard-health/util-ts";

import { expectToBeRight } from "./expectToBeRight";

/**
 * Alias for {@link expectToBeRight}
 */
export function expectToBeSuccess<A>(
  value: ServiceResult<A> | undefined,
): asserts value is E.Right<A> {
  expectToBeRight(value);
}
