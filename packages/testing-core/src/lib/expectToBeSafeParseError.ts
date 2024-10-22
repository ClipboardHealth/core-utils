import { ok } from "node:assert";

import { type SafeParseError, type SafeParseReturnType } from "zod";

import { expectToBeDefined } from "./expectToBeDefined";

/**
 * Asserts and narrows the type for Zod SafeParseReturnType to a SafeParseError.
 *
 * @throws {AssertionError} for SafeParseSuccess.
 */
export function expectToBeSafeParseError<Input, Output>(
  value: Readonly<SafeParseReturnType<Input, Output>>,
): asserts value is SafeParseError<Input> {
  expectToBeDefined(value);
  ok(!value.success, "Expected SafeParseError, got SafeParseSuccess");
}
