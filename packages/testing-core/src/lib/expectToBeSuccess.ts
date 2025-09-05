import { type either as E, type ServiceResult } from "@clipboard-health/util-ts";

import { expectToBeRight } from "./expectToBeRight";

/**
 * Asserts and narrows the type of the provided ServiceResult value to Success (Right).
 * @param value - The ServiceResult value to check
 * @throws {AssertionError} If the value is undefined or not a Success
 */
export function expectToBeSuccess<A>(
  value: ServiceResult<A> | undefined,
): asserts value is E.Right<A> {
  expectToBeRight(value);
}
