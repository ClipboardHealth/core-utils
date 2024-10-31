import { type Arrayable } from "type-fest";

import { CbhError, type CbhIssue } from "../errors/cbhError";

export type CbhResponse<T> = { success: true; data: T } | { success: false; error: CbhError };

/**
 * @deprecated Use {@link failure} instead.
 */
export function toErrorCbhResponse(issues: Arrayable<CbhIssue>): {
  success: false;
  error: CbhError;
} {
  return { success: false, error: new CbhError(issues) };
}

/**
 * @deprecated Use {@link success} instead.
 */
export function toSuccessCbhResponse<T>(data: T): { success: true; data: T } {
  return { success: true, data };
}
