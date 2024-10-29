import { ok } from "node:assert";

import { type Either, isRight, type Right } from "@clipboard-health/util-typescript";

import { expectToBeDefined } from "./expectToBeDefined";

export function expectToBeRight<A, E>(value: Either<E, A> | undefined): asserts value is Right<A> {
  expectToBeDefined(value);
  ok(isRight(value));
}
