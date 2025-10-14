import { isNullOrUndefined } from "@clipboard-health/util-ts";

export function ensureExistence<T>(value: T | undefined): T {
  if (isNullOrUndefined(value)) {
    throw new Error("not defined");
  }

  return value;
}
