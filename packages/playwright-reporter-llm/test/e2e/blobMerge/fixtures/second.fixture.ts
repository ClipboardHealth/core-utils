import { expect, test } from "@playwright/test";

test("retains a test from the second shard", () => {
  expect("second shard").toContain("shard");
});
