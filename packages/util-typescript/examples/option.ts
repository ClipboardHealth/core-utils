import { equal } from "node:assert/strict";

import { option as O, pipe } from "@clipboard-health/util-typescript";

function double(n: number) {
  return n * 2;
}

function inverse(n: number): O.Option<number> {
  return n === 0 ? O.none : O.some(1 / n);
}

const result = pipe(
  O.some(5),
  O.map(double),
  O.flatMap(inverse),
  O.match(
    (n) => `Result is ${n}`,
    () => "No result",
  ),
);

equal(result, "Result is 0.1");