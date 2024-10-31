import { ok } from "node:assert/strict";

import { either as E } from "@clipboard-health/util-ts";

import { expectToBeDefined } from "./expectToBeDefined";

/**
 * Asserts and narrows the type of the provided Either value to Right.
 * @param value - The Either value to check
 * @throws {AssertionError} If the value is undefined or not a Right
 */
export function expectToBeRight<A, E>(
  value: E.Either<E, A> | undefined,
): asserts value is E.Right<A> {
  expectToBeDefined(value);
  ok(E.isRight(value));
}
