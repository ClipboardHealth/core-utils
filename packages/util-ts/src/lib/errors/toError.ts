import { isString } from "../strings/isString";
import { stringify } from "../strings/stringify";
import { isError } from "./isError";

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

    // Preserve the original value's properties.
    return Object.assign(error, value);
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
