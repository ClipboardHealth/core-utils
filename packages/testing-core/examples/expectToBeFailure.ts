// embedex: packages/testing-core/README.md
import { strictEqual } from "node:assert/strict";

import { expectToBeFailure } from "@clipboard-health/testing-core";
import { failure, type ServiceResult, success } from "@clipboard-health/util-ts";

function validateAge(age: number): ServiceResult<number> {
  if (age < 0) {
    return failure({ issues: [{ code: "INVALID_AGE", message: "Age cannot be negative" }] });
  }

  return success(age);
}

const result = validateAge(-5);
expectToBeFailure(result);

// Narrowed to Left (Failure)
strictEqual(result.left.issues[0]?.message, "Age cannot be negative");
