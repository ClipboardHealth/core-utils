/**
 * Either a single value or an array of values.
 *
 * @deprecated Use `Arrayable` from "type-fest" instead.
 */
export type OneOrArray<T> = T | T[];

/**
 * If the provided value is an array, returns the first element. Otherwise, returns the value
 * itself.
 *
 * @deprecated Use `const [first] = [1, 2, 3]` instead.
 */
// eslint-disable-next-line sonarjs/deprecation
export function head<T>(value?: OneOrArray<T>): T | undefined {
  return Array.isArray(value) ? value[0] : (value ?? undefined);
}
