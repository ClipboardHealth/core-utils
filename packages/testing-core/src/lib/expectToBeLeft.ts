import { ok } from "node:assert";

import { either as E } from "@clipboard-health/util-typescript";

import { expectToBeDefined } from "./expectToBeDefined";

export function expectToBeLeft<E, A>(
  value: E.Either<E, A> | undefined,
): asserts value is E.Left<E> {
  expectToBeDefined(value);
  ok(E.isLeft(value));
}
