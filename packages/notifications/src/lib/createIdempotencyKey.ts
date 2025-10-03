import { createHash } from "node:crypto";

import stringify from "fast-json-stable-stringify";

export const MAX_IDEMPOTENCY_KEY_LENGTH = 255;

/**
 * Creates a deterministic hash for use as an idempotency key.
 *
 * The function normalizes `value` (using a stable JSON.stringify for non-string values), generates
 * a SHA-256 hash, prepends the workflow key, and truncates the result to MAX_IDEMPOTENCY_KEY_LENGTH
 * maximum.
 *
 * @param params.key - Workflow key to prepend to the hash.
 * @param params.value - Value to hash (string, string[], object, etc.).
 *
 * @returns A hash string prefixed with the workflow key.
 */
export function createIdempotencyKey(params: { key: string; value: unknown }) {
  const { key, value } = params;

  const hash = createHash("sha256")
    .update(typeof value === "string" ? value : stringify(value))
    .digest("hex");

  return `${key}:${hash}`.slice(0, MAX_IDEMPOTENCY_KEY_LENGTH);
}
