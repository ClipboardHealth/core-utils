import { ok } from "node:assert";

import { type SafeParseError, type SafeParseReturnType } from "zod";

import { expectToBeDefined } from "./expectToBeDefined";

export function expectToBeSafeParseError<Input, Output>(
  value: Readonly<SafeParseReturnType<Input, Output>>,
): asserts value is SafeParseError<Input> {
  expectToBeDefined(value);
  ok(!value.success);
}
