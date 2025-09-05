/**
 * Parses a JSON string and returns the parsed value with optional (unsafe) type assertion.
 *
 * @template T - The expected type of the parsed JSON value
 * @param value - The JSON string to parse
 * @param reviver - A function that transforms the result before returning it
 * @returns The parsed JSON value cast to type T
 * @throws {SyntaxError} When the JSON string is malformed
 *
 * @example
 * ```typescript
 * const data = parseJson<{ name: string }>('{"name": "John"}');
 * console.log(data.name); // "John"
 * ```
 */
export function parseJson<T = unknown>(
  value: string,
  reviver?: (this: unknown, key: string, value: unknown) => unknown,
): T {
  return JSON.parse(value, reviver) as T;
}
