import { expect, test } from "@playwright/test";

test.describe("Passing Suite", () => {
  test("adds numbers correctly", () => {
    expect(1 + 2).toBe(3);
  });

  test("checks string equality", () => {
    expect("hello").toBe("hello");
  });
});
