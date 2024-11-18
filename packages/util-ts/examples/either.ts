// packages/util-ts/src/lib/functional/either.ts
import { equal } from "node:assert/strict";

import { either as E, pipe } from "@clipboard-health/util-ts";

function double(n: number): number {
  return n * 2;
}

function inverse(n: number): E.Either<string, number> {
  return n === 0 ? E.left("Division by zero") : E.right(1 / n);
}

const result = pipe(
  E.right(5),
  E.map(double),
  E.flatMap(inverse),
  E.match(
    (error) => `Error: ${error}`,
    (result) => `Result is ${result}`,
  ),
);

equal(result, "Result is 0.1");
