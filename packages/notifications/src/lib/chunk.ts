/**
 * Creates an `array` of elements split into groups the length of `size`. If `array` can't be split
 * evenly, the final chunk will be the remaining elements.
 *
 * @param array - The array to chunk.
 * @param size - The length of each chunk.
 * @returns the new 2D array of chunks.
 */
export function chunk<T>(array: T[], size: number): T[][] {
  return Array.from({ length: Math.ceil(array.length / size) }, (_, index) =>
    array.slice(index * size, (index + 1) * size),
  );
}
