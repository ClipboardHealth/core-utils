import { isString } from "../strings/isString";
import { stringify } from "../strings/stringify";
import { isError } from "./isError";

const IGNORED_PROPERTIES = new Set([
  "message",
  "stack",
  "name",
  "__proto__",
  "prototype",
  "constructor",
]);

type PropertyObject = Record<PropertyKey, unknown>;

/**
 * Converts an error-like value to an Error instance. If the input is already an Error, returns it
 * directly. Otherwise, creates a new Error with an appropriate string representation of the input.
 *
 * @param value - The value to convert.
 * @returns An Error instance containing a string representation of the input
 */
export function toError(value: unknown): Error {
  if (isError(value)) {
    return value;
  }

  if (value && typeof value === "object" && "message" in value) {
    const error = new Error(String(value.message));
    if ("stack" in value) {
      error.stack = String(value.stack);
    }

    if ("name" in value && typeof value.name === "string") {
      error.name = String(value.name);
    }

    // Preserve original properties without clobbering.
    Reflect.ownKeys(value)
      .filter((key) => !IGNORED_PROPERTIES.has(String(key)))
      .forEach((key) => {
        (error as unknown as PropertyObject)[key] = (value as PropertyObject)[key];
      });

    return error;
  }

  if (typeof value === "symbol") {
    return new Error(String(value));
  }

  try {
    return new Error(isString(value) ? value : stringify(value));
  } catch {
    return new Error(String(value));
  }
}
