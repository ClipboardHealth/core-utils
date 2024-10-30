import { ok } from "node:assert/strict";

/**
 * Asserts and narrows the type for defined values.
 *
 * @throws {AssertionError} for null or undefined values.
 */
export function expectToBeDefined<T>(value: T | undefined): asserts value is T {
  ok(value !== undefined && value !== null, "Expected value to be defined, got null or undefined");
}
