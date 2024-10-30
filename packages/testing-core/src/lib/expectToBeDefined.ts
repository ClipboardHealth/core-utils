import { ok } from "node:assert/strict";

import { isDefined } from "@clipboard-health/util-typescript";

/**
 * Asserts and narrows the type for defined values.
 *
 * @throws {AssertionError} for null or undefined values.
 */
export function expectToBeDefined<T>(value: T | undefined): asserts value is T {
  ok(isDefined(value), "Expected value to be defined, got null or undefined");
}
