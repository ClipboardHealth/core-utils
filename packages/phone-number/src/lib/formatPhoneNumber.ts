import { failure, type ServiceResult, success } from "@clipboard-health/util-ts";
import { parsePhoneNumberWithError } from "libphonenumber-js";

export function formatPhoneNumber(params: {
  phoneNumber: string;
  format: "E.164" | "humanReadable";
}): ServiceResult<string> {
  const { phoneNumber, format } = params;

  try {
    const parsedPhoneNumber = parsePhoneNumberWithError(phoneNumber, { defaultCountry: "US" });
    return success(parsedPhoneNumber.format(format === "E.164" ? "E.164" : "NATIONAL"));
  } catch {
    return failure({ issues: [{ message: "Invalid phone number", code: "INVALID_PHONE_NUMBER" }] });
  }
}
