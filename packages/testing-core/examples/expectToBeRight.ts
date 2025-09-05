// packages/testing-core/README.md
import { strictEqual } from "node:assert/strict";

import { expectToBeRight } from "@clipboard-health/testing-core";
import { either as E } from "@clipboard-health/util-ts";

function divide(numerator: number, denominator: number): E.Either<string, number> {
  if (denominator === 0) {
    return E.left("Cannot divide by zero");
  }

  return E.right(numerator / denominator);
}

const value = divide(10, 2);
expectToBeRight(value);

// Narrowed to Right
strictEqual(value.right, 5);
