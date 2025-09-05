// packages/util-ts/README.md
import { ok } from "node:assert/strict";

import {
  ERROR_CODES,
  failure,
  isFailure,
  isSuccess,
  type ServiceResult,
  success,
} from "@clipboard-health/util-ts";

function validateUser(params: { email: string; phone: string }): ServiceResult<{ id: string }> {
  const { email, phone } = params;
  const code = ERROR_CODES.unprocessableEntity;

  if (!email.includes("@")) {
    return failure({ issues: [{ code, message: "Invalid email format" }] });
  }

  if (phone.length !== 12) {
    return failure({ issues: [{ code, message: "Invalid phone number" }] });
  }

  return success({ id: "user-123" });
}

ok(isFailure(validateUser({ email: "invalidEmail", phone: "invalidPhoneNumber" })));
ok(isSuccess(validateUser({ email: "user@example.com", phone: "555-555-5555" })));
