// packages/util-ts/src/lib/functional/pipe.ts,packages/util-ts/README.md
import { strictEqual } from "node:assert/strict";

import { pipe } from "@clipboard-health/util-ts";

const result = pipe(
  "  hello world  ",
  (s) => s.trim(),
  (s) => s.split(" "),
  (array) => array.map((word) => word.charAt(0).toUpperCase() + word.slice(1)),
  (array) => array.join(" "),
);

strictEqual(result, "Hello World");
