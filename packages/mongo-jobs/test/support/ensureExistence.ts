import { isNil } from "@clipboard-health/util-ts";

export function ensureExistence<T>(value: T | undefined): T {
  if (isNil(value)) {
    throw new Error("not defined");
  }

  return value;
}
