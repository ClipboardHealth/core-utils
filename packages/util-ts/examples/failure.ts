// packages/util-ts/src/lib/functional/serviceResult.ts,packages/util-ts/README.md
import { equal, ok } from "node:assert/strict";

import { either as E, ERROR_CODES, failure } from "@clipboard-health/util-ts";

const result = failure({
  issues: [{ code: ERROR_CODES.notFound, message: "User not found" }],
});

ok(E.isLeft(result));
equal(result.left.issues[0]?.message, "User not found");
