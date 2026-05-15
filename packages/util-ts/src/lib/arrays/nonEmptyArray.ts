/**
 * A tuple type that guarantees at least one element at the type level.
 *
 * Use when callers need a type-level non-empty guarantee — for example, after
 * narrowing with `isNonEmptyArray`, TypeScript will type the first element as
 * `T` rather than `T | undefined`.
 *
 * Unlike `nonEmptyString` in `@clipboard-health/contract-core`, which is
 * runtime-only because TypeScript has no structural "non-empty string" type
 * without branding, `NonEmptyArray` does encode non-emptiness in the type
 * system as `[T, ...T[]]`.
 *
 * @example
 * if (!isNonEmptyArray(items)) {
 *   return;
 * }
 * // items is now NonEmptyArray<T>, and items[0] is T (not T | undefined)
 */
export type NonEmptyArray<T> = [T, ...T[]];

/**
 * @deprecated Use `OneOrArray<T>` from "./head" instead. The "loose input"
 * pattern (`T | T[]`) is the common use case; if a non-empty guarantee is
 * required on the array branch, prefer `T | NonEmptyArray<T>` inline.
 */
export type OneOrNonEmptyArray<T> = T | NonEmptyArray<T>;

/**
 * Normalizes a single value or an array into a `NonEmptyArray<T>`.
 *
 * Useful when accepting loose input (`T | T[]`) at an API boundary and needing
 * to hand downstream code a value typed as non-empty.
 */
export function toNonEmptyArray<T>(value: T | NonEmptyArray<T>): NonEmptyArray<T> {
  return Array.isArray(value) ? value : [value];
}
