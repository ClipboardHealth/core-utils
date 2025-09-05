// packages/util-ts/src/lib/functional/serviceResult.ts,packages/util-ts/README.md
import { equal, ok } from "node:assert/strict";

import { ERROR_CODES, failure, isFailure } from "@clipboard-health/util-ts";

const result = failure({
  issues: [{ code: ERROR_CODES.notFound, message: "User not found" }],
});

ok(isFailure(result));
equal(result.left.issues[0]?.message, "User not found");
