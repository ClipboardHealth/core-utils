/**
 * @deprecated Use standard Array<T> instead.
 */
export type NonEmptyArray<T> = [T, ...T[]];

/**
 * @deprecated Use @{link OneOrArray} instead.
 */
export type OneOrNonEmptyArray<T> = T | NonEmptyArray<T>;

/**
 * @deprecated Use standard Array<T> instead.
 */
export function toNonEmptyArray<T>(value: OneOrNonEmptyArray<T>): NonEmptyArray<T> {
  return Array.isArray(value) ? value : [value];
}
