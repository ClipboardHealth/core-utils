// embedex: packages/util-ts/src/lib/functional/option.ts,packages/util-ts/README.md
import { strictEqual } from "node:assert/strict";

import { option as O, pipe } from "@clipboard-health/util-ts";

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
    () => "No result",
    (n) => `Result is ${n}`,
  ),
);

strictEqual(result, "Result is 0.1");
