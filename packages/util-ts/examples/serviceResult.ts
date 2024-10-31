import { ok } from "node:assert/strict";

import {
  either as E,
  ERROR_CODES,
  failure,
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

ok(E.isLeft(validateUser({ email: "invalidEmail", phone: "invalidPhoneNumber" })));
ok(E.isRight(validateUser({ email: "user@example.com", phone: "555-555-5555" })));
