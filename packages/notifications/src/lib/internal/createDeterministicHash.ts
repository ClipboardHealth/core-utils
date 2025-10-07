import { createHash } from "node:crypto";

import stringify from "fast-json-stable-stringify";

/**
 * Creates a deterministic hash.
 *
 * Normalizes `value` using stable JSON serialization for non-string values and generates
 * a SHA-256 hash, truncated to 32 hex characters (128 bits).
 *
 * Note: Non-JSON-serializable values (undefined, Symbol, functions, circular refs) may be
 * dropped or cause errors during serialization.
 *
 * @param value - Value to hash (string, string[], object, etc.).
 * @returns A 32-character hex string representing the hash.
 */
export function createDeterministicHash(value: unknown) {
  return createHash("sha256")
    .update(typeof value === "string" ? value : stringify(value))
    .digest("hex")
    .slice(0, 32);
}
