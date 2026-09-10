/**
 * Type guard that checks if a value is a non-null, non-array object (e.g. `{}`, `Date`, `Map`,
 * a class instance) — narrowed to `Record<string, unknown>` for keyed property access.
 *
 * @param value - The value to check
 * @returns True if the value is a record, false otherwise
 */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
