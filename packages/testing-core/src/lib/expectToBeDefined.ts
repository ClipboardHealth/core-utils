import { ok } from "node:assert";

export function expectToBeDefined<T>(value: T | undefined): asserts value is T {
  // eslint-disable-next-line no-eq-null, unicorn/no-null
  ok(value != null);
}
