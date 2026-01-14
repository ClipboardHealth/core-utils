/**
 * Parses an OTA build ID string to a number.
 *
 * @param otaBuildId - The OTA build ID string to parse
 * @returns The parsed number if the string contains only digits, otherwise 0
 *
 * @example
 * ```ts
 * getOtaBuildIdAsNumber("123") // returns 123
 * getOtaBuildIdAsNumber("abc") // returns 0
 * getOtaBuildIdAsNumber("12.3") // returns 0
 * getOtaBuildIdAsNumber("") // returns 0
 * ```
 */
export function getOtaBuildIdAsNumber(otaBuildId: string): number {
  if (!/^\d+$/.test(otaBuildId)) {
    return 0;
  }

  return Number.parseInt(otaBuildId, 10);
}
