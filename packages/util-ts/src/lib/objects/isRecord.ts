/**
 * Type guard that checks if a value is a plain record: a non-null object that is not an array.
 *
 * @param value - The value to check
 * @returns True if the value is a record, false otherwise
 */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
