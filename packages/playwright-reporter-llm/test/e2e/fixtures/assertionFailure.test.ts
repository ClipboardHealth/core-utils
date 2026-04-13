import { expect, test } from "@playwright/test";

test("fails with assertion mismatch", () => {
  expect("Actual").toBe("Expected");
});
