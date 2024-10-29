import { ok } from "node:assert";

import { isSome, type Option, type Some } from "@clipboard-health/util-typescript";

import { expectToBeDefined } from "./expectToBeDefined";

export function expectToBeSome<A>(value: Option<A> | undefined): asserts value is Some<A> {
  expectToBeDefined(value);
  ok(isSome(value));
}
