import { ok } from "node:assert/strict";

import { either as E } from "@clipboard-health/util-ts";
import { type ServiceResult } from "@clipboard-health/util-ts";

import { expectToBeDefined } from "./expectToBeDefined";

/**
 * Asserts and narrows the type of the provided ServiceResult value to Success (Right).
 * @param value - The ServiceResult value to check
 * @throws {AssertionError} If the value is undefined or not a Success
 */
export function expectToBeSuccess<A>(
  value: ServiceResult<A> | undefined,
): asserts value is E.Right<A> {
  expectToBeDefined(value);
  ok(E.isRight(value));
}
