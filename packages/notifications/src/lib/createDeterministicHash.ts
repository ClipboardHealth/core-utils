import { createHash } from "node:crypto";

/**
 * Creates a deterministic hash from `values`.
 *
 * The function sorts the strings, then generates a SHA-256 hash.
 *
 * @param params.values - Array of strings to hash.
 *
 * @returns A hash string of the specified length.
 */
export function createDeterministicHash(params: { values: string[] }) {
  const { values } = params;

  return (
    createHash("sha256")
      // Unicode code-points for deterministic, locale-independent sorting.
      .update(JSON.stringify(values.sort()))
      .digest("hex")
  );
}
