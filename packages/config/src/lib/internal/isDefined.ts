/**
 * Type guard that checks if a value is neither null nor undefined.
 */
export function isDefined<T>(value: T): value is NonNullable<T> {
  return value !== null && value !== undefined;
}
