import { defineConfig } from "@playwright/test";

// oxlint-disable-next-line node/no-process-env
const outputFile = process.env["PLAYWRIGHT_LLM_OUTPUT_FILE"];
if (!outputFile) {
  throw new Error("PLAYWRIGHT_LLM_OUTPUT_FILE is required");
}

export default defineConfig({
  reporter: [["../../../src/index.ts", { outputFile }]],
});
