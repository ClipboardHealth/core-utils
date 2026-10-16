import { defineConfig } from "@playwright/test";

const outputDirectory = process.env["PLAYWRIGHT_TEST_OUTPUT_DIRECTORY"];
if (!outputDirectory) {
  throw new Error("PLAYWRIGHT_TEST_OUTPUT_DIRECTORY is required");
}

export default defineConfig({
  testDir: "./fixtures",
  testMatch: "*.fixture.ts",
  outputDir: outputDirectory,
  retries: 1,
  workers: 1,
  reporter: [["blob"]],
});
