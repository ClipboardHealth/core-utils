import { createHash } from "node:crypto";

/**
 * Creates a deterministic hash from `items`.
 *
 * The function sorts the strings, then generates a SHA-256 hash truncated to the specified number
 * of characters.
 *
 * @param params.items - Array of strings or objects with id property to hash.
 * @param params.characters - Number of characters in the resulting hash (default: 32).
 *
 * @returns A hash string of the specified length.
 */
export function createDeterministicHash(params: {
  items: string[] | Array<{ id: string }>;
  characters?: number;
}) {
  const { items, characters = 32 } = params;

  const hash = createHash("sha256")
    // Unicode code-points for deterministic, locale-independent sorting.
    .update(JSON.stringify(items.map((item) => (typeof item === "string" ? item : item.id)).sort()))
    .digest("hex");

  const length = Math.max(1, Math.min(characters, hash.length));
  return hash.slice(0, length);
}
