import { ok } from "node:assert";

import { type SafeParseError, type SafeParseReturnType, type SafeParseSuccess } from "zod";

// eslint-disable-next-line @typescript-eslint/ban-types
type NullOrUndefined = null | undefined;

function isNullOrUndefined<T>(value: T | NullOrUndefined): value is NullOrUndefined {
  return value === null || value === undefined;
}

function isDefined<T>(value: T | NullOrUndefined): value is T {
  return !isNullOrUndefined(value);
}

function expectToBeDefined<T>(value: T | undefined): asserts value is T {
  ok(isDefined(value));
}

export function expectToBeSuccess<Input, Output>(
  value: Readonly<SafeParseReturnType<Input, Output>>,
): asserts value is SafeParseSuccess<Output> {
  expectToBeDefined(value);
  ok(value.success);
}

export function expectToBeError<Input, Output>(
  value: Readonly<SafeParseReturnType<Input, Output>>,
): asserts value is SafeParseError<Input> {
  expectToBeDefined(value);
  ok(!value.success);
}
