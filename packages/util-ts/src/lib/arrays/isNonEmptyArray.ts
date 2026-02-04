/**
 * Type guard that narrows an array to a non-empty tuple type.
 * After this check, TypeScript knows `arr[0]` is defined.
 *
 * @example
 * if (!isNonEmptyArray(items)) {
 *   return;
 * }
 * // items[0] is now typed as T (not T | undefined)
 * const first = items[0];
 */
export function isNonEmptyArray<T>(array: T[]): array is [T, ...T[]] {
  return array.length > 0;
}
