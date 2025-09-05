// packages/testing-core/README.md
import { equal } from "node:assert/strict";

import { expectToBeSuccess } from "@clipboard-health/testing-core";
import { failure, type ServiceResult, success } from "@clipboard-health/util-ts";

function validateAge(age: number): ServiceResult<number> {
  if (age < 0) {
    return failure({ issues: [{ code: "INVALID_AGE", message: "Age cannot be negative" }] });
  }

  return success(age);
}

const result = validateAge(25);
expectToBeSuccess(result);

// Narrowed to Right (Success)
equal(result.right, 25);
