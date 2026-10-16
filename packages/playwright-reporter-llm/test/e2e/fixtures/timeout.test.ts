import { test } from "@playwright/test";

test("times out waiting for element", async () => {
  test.setTimeout(500);
  await new Promise<void>((resolve) => {
    setTimeout(resolve, 5000);
  });
});
