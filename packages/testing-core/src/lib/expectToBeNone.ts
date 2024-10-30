import { ok } from "node:assert/strict";

import { option as O } from "@clipboard-health/util-typescript";

import { expectToBeDefined } from "./expectToBeDefined";

/**
 * Asserts and narrows the type of the provided Option value to None.
 * @param value - The Option value to check
 * @throws {AssertionError} If the value is undefined or not a None
 */
export function expectToBeNone<A>(value: O.Option<A> | undefined): asserts value is O.None {
  expectToBeDefined(value);
  ok(O.isNone(value));
}
