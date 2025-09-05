// packages/util-ts/src/lib/functional/serviceResult.ts,packages/util-ts/README.md
import { equal, ok } from "node:assert/strict";

import { either as E, success } from "@clipboard-health/util-ts";

const result = success("Hello, World!");

ok(E.isRight(result));
equal(result.right, "Hello, World!");
