import { formatPhoneNumber as formatPhoneNumberF } from "@clipboard-health/phone-number";
import { either as E, pipe } from "@clipboard-health/util-ts";

/**
 * Formats a phone number to E.164 format.
 *
 * If the phone number cannot be formatted (invalid format, missing country code, etc.),
 * returns the original phone number unchanged.
 */
export function formatPhoneNumber(params: { phoneNumber: string }): string {
  const { phoneNumber } = params;

  return pipe(
    formatPhoneNumberF({ phoneNumber, format: "E.164" }),
    E.getOrElse(() => phoneNumber),
  );
}
