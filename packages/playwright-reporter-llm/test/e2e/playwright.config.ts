import path from "node:path";

import { defineConfig } from "@playwright/test";

const outputDirectory = path.resolve(__dirname, "test-results");

export default defineConfig({
  testDir: "./fixtures",
  outputDir: outputDirectory,
  retries: 1,
  workers: 1,
  reporter: [
    ["../../src/index.ts", { outputFile: path.resolve(outputDirectory, "llm-report.json") }],
  ],
  projects: [
    {
      name: "chromium",
    },
  ],
});
