import { isError } from "./isError";
import { isString } from "./isString";
import { stringify } from "./stringify";

/**
 * Converts any value to an Error instance. If the input is already an Error,
 * returns it directly. Otherwise, creates a new Error with an appropriate
 * string representation of the input.
 *
 * @param value - The value to convert. Can be of any type
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
