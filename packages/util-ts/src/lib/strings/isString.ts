/**
 * Type guard that checks if a value is a string.
 *
 * @param value - The value to check
 * @returns `true` if the value is a string object or primitive, `false` otherwise
 */
export function isString(value: unknown): value is string {
  // oxlint-disable-next-line unicorn/no-instanceof-builtins -- String wrappers require instanceof; toString can be forged via Symbol.toStringTag
  return typeof value === "string" || value instanceof String;
}
