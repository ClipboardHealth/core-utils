import { type CountryCode, parsePhoneNumberFromString } from "libphonenumber-js";

import { isValidPhoneNumber } from "./isValidPhoneNumber";
import { type WithPhoneNumber } from "./types";

const US_COUNTRY_CODES: ReadonlySet<CountryCode> = new Set<CountryCode>([
  "US",
  "PR",
  "GU",
  "VI",
  "AS",
  "MP",
]);

export type IsUsPhoneNumberParams = WithPhoneNumber;

/**
 * Checks whether a phone number is a valid US phone number.
 *
 * Validates that the number is both a valid phone number and belongs to the US or a US territory
 * (Puerto Rico, Guam, US Virgin Islands, American Samoa, Northern Mariana Islands).
 *
 * Unlike `isValidPhoneNumber`, this function rejects valid non-US international numbers
 * (e.g. UK +44, German +49) as well as Canadian numbers (+1 with CA area codes).
 *
 * @example
 * ```ts
 * isUsPhoneNumber({ phoneNumber: "2125551234" }); // true (US)
 * isUsPhoneNumber({ phoneNumber: "7872034310" }); // true (Puerto Rico)
 * isUsPhoneNumber({ phoneNumber: "+14165551234" }); // false (Canada)
 * isUsPhoneNumber({ phoneNumber: "+442079460958" }); // false (UK)
 * ```
 */
export function isUsPhoneNumber(params: IsUsPhoneNumberParams): boolean {
  const { phoneNumber } = params;

  if (!isValidPhoneNumber({ phoneNumber })) {
    return false;
  }

  const parsed = parsePhoneNumberFromString(phoneNumber.trim(), "US");

  return parsed?.country !== undefined && US_COUNTRY_CODES.has(parsed.country);
}
