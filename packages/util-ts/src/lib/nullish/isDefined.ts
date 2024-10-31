import { type NullOrUndefined } from "../types";
import { isNil } from "./isNil";

/**
 * Type guard that checks if a value is defined (not null or undefined).
 *
 * @template T - The type of the value when it is defined
 * @param value - The value to check
 * @returns True if the value is defined (not null or undefined), false otherwise
 */
export function isDefined<T>(value: T | NullOrUndefined): value is T {
  return !isNil(value);
}
