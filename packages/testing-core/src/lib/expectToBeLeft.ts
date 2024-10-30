import { ok } from "node:assert/strict";

import { either as E } from "@clipboard-health/util-typescript";

import { expectToBeDefined } from "./expectToBeDefined";

/**
 * Asserts and narrows the type of the provided Either value to Left.
 * @param value - The Either value to check
 * @throws {AssertionError} If the value is undefined or not a Left
 */
export function expectToBeLeft<E, A>(
  value: E.Either<E, A> | undefined,
): asserts value is E.Left<E> {
  expectToBeDefined(value);
  ok(E.isLeft(value));
}
