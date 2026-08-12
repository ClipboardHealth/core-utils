import { expect, test } from "@playwright/test";

test("retains stdout from a passing test", () => {
  // eslint-disable-next-line no-console
  console.log("passing stdout from the first shard");
  expect(true).toBe(true);
});

test("retains stdout from every flaky attempt", () => {
  const retry = test.info().retry;
  // eslint-disable-next-line no-console
  console.log(`flaky stdout from retry ${retry}`);
  expect(retry).toBe(1);
});
