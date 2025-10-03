import { isValidPhoneNumber as isValidPhoneNumberF } from "libphonenumber-js";

import { type WithPhoneNumber } from "./types";

export type IsValidPhoneNumberParams = WithPhoneNumber;

export function isValidPhoneNumber(params: IsValidPhoneNumberParams): boolean {
  const { phoneNumber } = params;

  return isValidPhoneNumberF(phoneNumber.trim(), {
    defaultCountry: "US",
  });
}
