import { ok } from "node:assert";

import { isNone, type None, type Option } from "@clipboard-health/util-typescript";

import { expectToBeDefined } from "./expectToBeDefined";

export function expectToBeNone<A>(value: Option<A> | undefined): asserts value is None {
  expectToBeDefined(value);
  ok(isNone(value));
}
