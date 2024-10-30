import { ok } from "node:assert";

import { either as E } from "@clipboard-health/util-typescript";

import { expectToBeDefined } from "./expectToBeDefined";

export function expectToBeRight<A, E>(
  value: E.Either<E, A> | undefined,
): asserts value is E.Right<A> {
  expectToBeDefined(value);
  ok(E.isRight(value));
}
