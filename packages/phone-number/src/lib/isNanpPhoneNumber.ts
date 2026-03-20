import { parsePhoneNumberFromString } from "libphonenumber-js";

import { isValidPhoneNumber } from "./isValidPhoneNumber";
import { type WithPhoneNumber } from "./types";

const NANP_COUNTRY_CALLING_CODE = "1";

export type IsNanpPhoneNumberParams = WithPhoneNumber;

/**
 * Checks whether a phone number is a valid NANP (North American Numbering Plan) phone number.
 *
 * Validates that the number is both a valid phone number and belongs to the NANP region
 * (country calling code "1"), which correctly accepts phone numbers from US territories
 * (Puerto Rico, Guam, US Virgin Islands, American Samoa, Northern Mariana Islands)
 * in addition to mainland US and Canadian numbers.
 *
 * Unlike `isValidPhoneNumber`, this function rejects valid non-NANP international numbers
 * (e.g. UK +44, German +49).
 *
 * @example
 * ```ts
 * isNanpPhoneNumber({ phoneNumber: "2125551234" }); // true (US)
 * isNanpPhoneNumber({ phoneNumber: "7872034310" }); // true (Puerto Rico)
 * isNanpPhoneNumber({ phoneNumber: "+442079460958" }); // false (UK)
 * ```
 */
export function isNanpPhoneNumber(params: IsNanpPhoneNumberParams): boolean {
  const { phoneNumber } = params;

  if (!isValidPhoneNumber({ phoneNumber })) {
    return false;
  }

  const parsed = parsePhoneNumberFromString(phoneNumber.trim(), "US");

  return parsed?.countryCallingCode === NANP_COUNTRY_CALLING_CODE;
}
