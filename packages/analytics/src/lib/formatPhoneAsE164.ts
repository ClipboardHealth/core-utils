import { either as E, ServiceError } from "@clipboard-health/util-ts";
import { parsePhoneNumberWithError } from "libphonenumber-js";

export function formatPhoneAsE164(params: { phone: string }): E.Either<ServiceError, string> {
  const { phone } = params;

  try {
    return E.right(parsePhoneNumberWithError(phone, { defaultCountry: "US" }).format("E.164"));
  } catch {
    return E.left(
      new ServiceError({
        issues: [{ message: "Invalid phone number", code: "INVALID_PHONE_NUMBER" }],
      }),
    );
  }
}
