import { type NullOrUndefined } from "./types";

/**
 * Type guard that checks if a value is null or undefined.
 *
 * @param value - The value to check
 * @returns True if the value is null or undefined, false otherwise
 */
export function isNil(value: unknown): value is NullOrUndefined {
  return value === null || value === undefined;
}
