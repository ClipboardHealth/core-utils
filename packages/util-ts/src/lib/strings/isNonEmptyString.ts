/**
 * Type guard that checks if a value is a string with at least one character.
 *
 * @param value - The value to check
 * @returns `true` if the value is a non-empty string primitive, `false` otherwise
 */
export function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}
