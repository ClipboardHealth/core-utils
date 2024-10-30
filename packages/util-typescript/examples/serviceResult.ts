import { ok } from "node:assert/strict";

import {
  ERROR_CODES,
  failure,
  type ServiceResult,
  success,
} from "@clipboard-health/util-typescript";

import { isLeft, isRight } from "../src/lib/functional/either";

function validateUser(params: { email: string; phone: string }): ServiceResult<{ id: string }> {
  const { email, phone } = params;
  const code = ERROR_CODES.unprocessableContent;

  if (!email.includes("@")) {
    return failure({ issues: [{ code, detail: "Invalid email format" }] });
  }

  if (phone.length !== 12) {
    return failure({ issues: [{ code, detail: "Invalid phone number" }] });
  }

  return success({ id: "user-123" });
}

ok(isLeft(validateUser({ email: "invalidEmail", phone: "invalidPhoneNumber" })));
ok(isRight(validateUser({ email: "user@example.com", phone: "555-555-5555" })));
