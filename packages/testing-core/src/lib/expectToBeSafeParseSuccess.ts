import { ok } from "node:assert";

import { type SafeParseReturnType, type SafeParseSuccess } from "zod";

import { expectToBeDefined } from "./expectToBeDefined";

export function expectToBeSafeParseSuccess<Input, Output>(
  value: Readonly<SafeParseReturnType<Input, Output>>,
): asserts value is SafeParseSuccess<Output> {
  expectToBeDefined(value);
  ok(value.success);
}
