/**
 * Converts a value to a JSON string, with special handling for BigInt values.
 *
 * @param value - The value to stringify
 * @returns A JSON string representation of the value
 * @throws {TypeError} When the value contains circular references
 */
export function stringify(
  value: unknown,
  replacer?: (this: unknown, key: string, value: unknown) => unknown,
  space?: string | number,
): string {
  return JSON.stringify(value, replacer ?? defaultReplacer, space);
}

function defaultReplacer(this: unknown, _key: string, value: unknown): unknown {
  return typeof value === "bigint" ? String(value) : value;
}
