/**
 * Converts a value to a JSON string, with special handling for BigInt values.
 *
 * @param value - The value to stringify
 * @returns A JSON string representation of the value
 * @throws {TypeError} When the value contains circular references
 */
export function stringify(value: unknown): string {
  return JSON.stringify(value, (_, value: unknown) =>
    typeof value === "bigint" ? String(value) : value,
  );
}
