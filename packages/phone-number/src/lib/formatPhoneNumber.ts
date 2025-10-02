import {
  failure,
  isFailure,
  type ServiceResult,
  success,
  toError,
} from "@clipboard-health/util-ts";
import { parsePhoneNumberWithError } from "libphonenumber-js";

import { type WithPhoneNumber } from "./types";

export interface FormatPhoneNumberParams extends WithPhoneNumber {
  format: "E.164" | "humanReadable";
}

/**
 * Formats a phone number to the specified format.
 *
 * @param params - The formatting parameters
 * @param params.phoneNumber - The phone number to format
 * @param params.format - The desired output format ("E.164" for international format or "humanReadable" for national format)
 * @returns A ServiceResult containing the formatted phone number or an error
 *
 * @example
 * ```ts
 * const result = formatPhoneNumber({ phoneNumber: "(555) 123-4567", format: "E.164" });
 * if (isSuccess(result)) {
 *   console.log(result.value); // "+15551234567"
 * }
 * ```
 */
export function formatPhoneNumber(params: FormatPhoneNumberParams): ServiceResult<string> {
  const { phoneNumber, format } = params;

  try {
    const parsedPhoneNumber = parsePhoneNumberWithError(phoneNumber.trim(), {
      defaultCountry: "US",
    });
    return success(parsedPhoneNumber.format(format === "E.164" ? "E.164" : "NATIONAL"));
  } catch (error) {
    return failure({ issues: [{ message: toError(error).message, code: "INVALID_PHONE_NUMBER" }] });
  }
}

/**
 * Formats a phone number to the specified format, throwing an error if formatting fails.
 *
 * This is a convenience function that wraps `formatPhoneNumber` and throws an error
 * instead of returning a ServiceResult. Use this when you want to handle errors via
 * exception handling rather than explicit error checking.
 *
 * @param params - The formatting parameters
 * @param params.phoneNumber - The phone number to format
 * @param params.format - The desired output format ("E.164" for international format or "humanReadable" for national format)
 * @returns The formatted phone number
 * @throws Error when the phone number cannot be formatted (invalid format, missing country code, etc.)
 *
 * @example
 * ```ts
 * try {
 *   const formatted = formatPhoneNumberOrThrow({ phoneNumber: "(555) 123-4567", format: "E.164" });
 *   console.log(formatted); // "+15551234567"
 * } catch (error) {
 *   console.error("Invalid phone number:", error.message);
 * }
 * ```
 */
export function formatPhoneNumberOrThrow(params: FormatPhoneNumberParams): string {
  const result = formatPhoneNumber(params);
  if (isFailure(result)) {
    throw result.error;
  }

  return result.value;
}
