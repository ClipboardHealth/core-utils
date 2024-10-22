import { ok } from "node:assert";

import { type SafeParseReturnType, type SafeParseSuccess } from "zod";

import { expectToBeDefined } from "./expectToBeDefined";

/**
 * Asserts and narrows the type for Zod SafeParseReturnType to a SafeParseSuccess.
 *
 * @throws {AssertionError} for SafeParseError.
 */
export function expectToBeSafeParseSuccess<Input, Output>(
  value: Readonly<SafeParseReturnType<Input, Output>>,
): asserts value is SafeParseSuccess<Output> {
  expectToBeDefined(value);
  ok(value.success, "Expected SafeParseSuccess, got SafeParseError");
}
