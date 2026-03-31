/**
 * Checks if a value is empty. Arrays are empty if they have no elements.
 * Objects are empty if they have no own enumerable properties.
 * Strings are empty if they have no characters.
 * All other non-object types (numbers, booleans, null, undefined) are considered empty.
 *
 * @param{unknown} value - The value to check
 * @returns{boolean} True if the value is empty, false otherwise
 */
export function isEmpty(value: unknown): boolean {
  if (Array.isArray(value) && value.length > 0) {
    return false;
  }

  if (typeof value === "string") {
    return value.length === 0;
  }

  if (value === null || typeof value !== "object") {
    return true;
  }

  return Object.keys(value).length === 0;
}
