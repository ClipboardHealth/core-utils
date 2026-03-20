import { registerDecorator, type ValidationOptions } from "class-validator";
import { parsePhoneNumberFromString } from "libphonenumber-js";

import { isValidPhoneNumber } from "./isValidPhoneNumber";

const NANP_COUNTRY_CALLING_CODE = "1";

/**
 * Validates that a phone number is a valid NANP (North American Numbering Plan) phone number.
 *
 * Unlike class-validator's `@IsPhoneNumber("US")`, this validator does not perform a strict
 * country-code match. It validates that the number is both a valid phone number and belongs to
 * the NANP region (country calling code "1"), which correctly accepts phone numbers from US
 * territories (Puerto Rico, Guam, US Virgin Islands, American Samoa, Northern Mariana Islands)
 * in addition to mainland US and Canadian numbers.
 */
export function IsNanpPhoneNumber(validationOptions?: ValidationOptions): PropertyDecorator {
  return function (object: object, propertyName: string | symbol): void {
    registerDecorator({
      name: "IsNanpPhoneNumber",
      target: object.constructor,
      propertyName: propertyName as string,
      constraints: [],
      options: {
        message: `${String(propertyName)} must be a valid phone number`,
        ...validationOptions,
      },
      validator: {
        validate(value: unknown): boolean {
          if (typeof value !== "string") {
            return false;
          }

          if (!isValidPhoneNumber({ phoneNumber: value })) {
            return false;
          }

          const parsed = parsePhoneNumberFromString(value.trim(), "US");

          return parsed?.countryCallingCode === NANP_COUNTRY_CALLING_CODE;
        },
      },
    });
  };
}
