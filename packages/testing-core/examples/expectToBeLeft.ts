import { ok } from "node:assert/strict";

import { expectToBeLeft } from "@clipboard-health/testing-core";
import { type Either, left, right } from "@clipboard-health/util-typescript";

function divide(numerator: number, denominator: number): Either<string, number> {
  if (denominator === 0) {
    return left("Cannot divide by zero");
  }

  return right(numerator / denominator);
}

const value = divide(10, 0);
expectToBeLeft(value);

// Narrowed to Left
ok(value.left === "Cannot divide by zero");
