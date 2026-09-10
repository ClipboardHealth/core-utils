import { test } from "@playwright/test";

// oxlint-disable-next-line vitest/expect-expect -- intentional timeout fixture
test("times out waiting for element", async () => {
  test.setTimeout(500);
  await new Promise<void>((resolve) => {
    setTimeout(resolve, 5000);
  });
});
