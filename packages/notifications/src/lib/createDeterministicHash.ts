import { createHash } from "node:crypto";

/**
 * Creates a deterministic hash from `items`.
 *
 * The function sorts the strings, then generates a SHA-256 hash truncated to the specified number
 * of characters for collision resistance.
 *
 * @param params.items - Array of strings to hash.
 * @param params.separator - String to join the sorted strings with (default: ",").
 * @param params.characters - Number of characters in the resulting hash (default: 32).
 *
 * @returns A hash string of the specified length.
 */
export function createDeterministicHash(params: {
  items: string[] | Array<{ id: string }>;
  separator?: string;
  characters?: number;
}) {
  const { items, separator = ",", characters = 32 } = params;

  const ids = items
    .map((item) => (typeof item === "string" ? item : item.id))
    .sort((a, b) => a.localeCompare(b))
    .join(separator);

  const hash = createHash("sha256").update(ids).digest("hex");

  return hash.slice(0, Math.min(characters, hash.length));
}
