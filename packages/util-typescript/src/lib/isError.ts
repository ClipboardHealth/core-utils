/**
 * Type guard that checks if a value is an instance of Error.
 *
 * @param value - The value to check
 * @returns True if the value is an Error instance, false otherwise
 */
export function isError(value: unknown): value is Error {
  return value instanceof Error;
}
