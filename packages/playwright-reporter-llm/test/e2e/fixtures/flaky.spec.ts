import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { expect, test } from "@playwright/test";

const markerDirectory = path.join(__dirname, "..", "test-results");
const markerFile = path.join(markerDirectory, ".flaky-marker");

test("passes on retry", async () => {
  if (!existsSync(markerFile)) {
    mkdirSync(markerDirectory, { recursive: true });
    writeFileSync(markerFile, "1");
    expect(true).toBe(false);
  }

  await test.info().attach("evidence", {
    path: markerFile,
    contentType: "text/plain",
  });
});
