/**
 * Force cast to the provided type.
 *
 * @deprecated Use type guards instead.
 */
export function forceCast<T>(value: unknown): T {
  return value as T;
}
