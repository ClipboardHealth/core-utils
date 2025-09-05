import { ok } from "node:assert/strict";

import { either as E } from "@clipboard-health/util-ts";
import { type ServiceError, type ServiceResult } from "@clipboard-health/util-ts";

import { expectToBeDefined } from "./expectToBeDefined";

/**
 * Asserts and narrows the type of the provided ServiceResult value to Failure (Left with ServiceError).
 * @param value - The ServiceResult value to check
 * @throws {AssertionError} If the value is undefined or not a Failure
 */
export function expectToBeFailure<A>(
  value: ServiceResult<A> | undefined,
): asserts value is E.Left<ServiceError> {
  expectToBeDefined(value);
  ok(E.isLeft(value));
}
