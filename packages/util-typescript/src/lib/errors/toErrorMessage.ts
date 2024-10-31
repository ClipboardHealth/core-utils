import { toError } from "./toError";

/**
 * Converts any value to an Error instance and returns the message.
 *
 * @param value - The value to convert.
 * @returns The Error instance's message field.
 */
export function toErrorMessage(value: unknown): string {
  return toError(value).message;
}
