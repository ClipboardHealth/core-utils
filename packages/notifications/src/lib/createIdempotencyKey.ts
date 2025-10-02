import { createHash } from "node:crypto";

import { MAX_IDEMPOTENCY_KEY_LENGTH } from "./internal/createChunkedIdempotencyKey";

/**
 * Creates a deterministic hash for use as an idempotency key.
 *
 * The function sorts `valuesToHash`, generates a SHA-256 hash, prepends the workflow key, and
 * truncates the result to MAX_IDEMPOTENCY_KEY_LENGTH characters maximum.
 *
 * @param params.key - Workflow key to prepend to the hash.
 * @param params.valuesToHash - Array of strings to hash.
 *
 * @returns A hash string prefixed with the workflow key.
 */
export function createIdempotencyKey(params: { key: string; valuesToHash: string[] }) {
  const { key, valuesToHash } = params;

  const hash = createHash("sha256")
    // Unicode code-points for deterministic, locale-independent sorting; don't mutate input array.
    .update(JSON.stringify([...valuesToHash].sort()))
    .digest("hex");

  const result = `${key}${hash}`;
  return result.slice(0, MAX_IDEMPOTENCY_KEY_LENGTH);
}
