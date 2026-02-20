import { createHash } from "node:crypto";

import { stringify } from "./stringify";

/**
 * Creates a deterministic hash.
 *
 * Normalizes `value` using stable JSON serialization for non-string values and generates
 * a SHA-256 hash.
 *
 * Note: Non-JSON-serializable values (undefined, Symbol, functions, circular refs) may be
 * dropped or cause errors during serialization.
 *
 * @param value - Value to hash (string, string[], object, etc.).
 * @returns A hex string representing the hash.
 */
export function createDeterministicHash(value: unknown): string {
  return createHash("sha256")
    .update(typeof value === "string" ? value : stringify(value))
    .digest("hex");
}
