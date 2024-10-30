import { ok } from "node:assert";

import { option as O } from "@clipboard-health/util-typescript";

import { expectToBeDefined } from "./expectToBeDefined";

export function expectToBeNone<A>(value: O.Option<A> | undefined): asserts value is O.None {
  expectToBeDefined(value);
  ok(O.isNone(value));
}
