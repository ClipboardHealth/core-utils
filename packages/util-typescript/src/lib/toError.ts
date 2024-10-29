import { isError } from "./isError";
import { isString } from "./isString";
import { stringify } from "./stringify";

/**
 * Convert the provided value to an `Error` instance.
 */
export function toError(error: unknown): Error {
  if (isError(error)) {
    return error;
  }

  if (typeof error === "symbol") {
    return new Error(String(error));
  }

  try {
    return new Error(isString(error) ? error : stringify(error));
  } catch {
    return new Error(String(error));
  }
}
