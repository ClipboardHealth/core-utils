import { ok } from "node:assert";

import { type Either, isLeft, type Left } from "@clipboard-health/util-typescript";

import { expectToBeDefined } from "./expectToBeDefined";

export function expectToBeLeft<E, A>(value: Either<E, A> | undefined): asserts value is Left<E> {
  expectToBeDefined(value);
  ok(isLeft(value));
}
