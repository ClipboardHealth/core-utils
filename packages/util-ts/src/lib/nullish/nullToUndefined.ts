/**
 * Turns a null-returning promise into a promise returning undefined.
 *
 * Some libraries we use return promises or promise-like objects that can resolve to null. This
 * function converts them to undefined.
 */

export async function nullToUndefined<T>(value: PromiseLike<T | null>): Promise<T | undefined> {
  return (await value) ?? undefined;
}
