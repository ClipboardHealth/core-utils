import { ok } from "node:assert/strict";

import { expectToBeRight } from "@clipboard-health/testing-core";
import { type Either, left, right } from "@clipboard-health/util-typescript";

function divide(numerator: number, denominator: number): Either<string, number> {
  if (denominator === 0) {
    return left("Cannot divide by zero");
  }

  return right(numerator / denominator);
}

const value = divide(10, 2);
expectToBeRight(value);

// Narrowed to Right
ok(value.right === 5);
