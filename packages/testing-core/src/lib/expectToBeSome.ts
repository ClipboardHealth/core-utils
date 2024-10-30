import { ok } from "node:assert";

import { option as O } from "@clipboard-health/util-typescript";

import { expectToBeDefined } from "./expectToBeDefined";

export function expectToBeSome<A>(value: O.Option<A> | undefined): asserts value is O.Some<A> {
  expectToBeDefined(value);
  ok(O.isSome(value));
}
