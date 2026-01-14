import { isDefined } from "../nullish";

/**
 * Parses an OTA build ID string to a number.
 *
 * @param otaBuildId - The OTA build ID string to parse, or undefined
 * @returns The parsed number if the string contains only digits, otherwise 0
 *
 * @example
 * ```ts
 * getOtaBuildIdAsNumber("123") // returns 123
 * getOtaBuildIdAsNumber("abc") // returns 0
 * getOtaBuildIdAsNumber("12.3") // returns 0
 * getOtaBuildIdAsNumber("") // returns 0
 * getOtaBuildIdAsNumber(undefined) // returns 0
 * ```
 */
export function getOtaBuildIdAsNumber(otaBuildId: string | undefined): number {
  if (!isDefined(otaBuildId)) {
    return 0;
  }

  if (!/^\d+$/.test(otaBuildId)) {
    return 0;
  }

  const buildNumber = Number.parseInt(otaBuildId, 10);
  /* istanbul ignore next -- defensive check, unreachable after regex validation */
  if (Number.isNaN(buildNumber)) {
    return 0;
  }

  return buildNumber;
}
