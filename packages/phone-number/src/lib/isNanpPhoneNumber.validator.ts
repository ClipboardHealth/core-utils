import { registerDecorator, type ValidationOptions } from "class-validator";

import { isValidPhoneNumber } from "./isValidPhoneNumber";

/**
 * Validates that a phone number is a valid NANP (North American Numbering Plan) phone number.
 *
 * Unlike class-validator's `@IsPhoneNumber("US")`, this validator does not perform a strict
 * country-code match. It uses `libphonenumber-js`'s `isValidPhoneNumber` with `defaultCountry: "US"`,
 * which correctly accepts phone numbers from US territories (Puerto Rico, Guam, US Virgin Islands,
 * American Samoa, Northern Mariana Islands) in addition to mainland US numbers.
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

          return isValidPhoneNumber({ phoneNumber: value });
        },
      },
    });
  };
}
