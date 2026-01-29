/**
 * Iterates over an array and applies an async function to each item sequentially.
 *
 * Usages of this function should be intentional. If it's possible to parallelize the tasks, you
 * should use `.map` and `Promise.all()` instead, or you could batch promises together with some
 * limit. Only uses this when order matters or when parallel execution would cause issues (e.g.,
 * rate limiting, database transactions).
 *
 *
 * @param array - The array to iterate over.
 * @param asyncTask - The async function to apply to each item.
 * @example
 *   const users = [{ id: 1 }, { id: 2 }, { id: 3 }];
 *   await forEachAsyncSequentially(users, async (user) => {
 *     await sendEmail(user.id);
 *   });
 */
export async function forEachAsyncSequentially<T>(
  array: T[],
  asyncTask: (item: T, index: number) => Promise<unknown>,
): Promise<void> {
  for (const [index, item] of array.entries()) {
    // eslint-disable-next-line no-await-in-loop
    await asyncTask(item, index);
  }
}
