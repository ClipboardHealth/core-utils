import { definePackageVitestConfig } from "../../vitest.preset";

export default definePackageVitestConfig({
  coverageThresholds: {
    branches: 80,
    functions: 100,
    lines: 90,
    statements: 90,
  },
  name: "playwright-reporter-llm",
  reportsDirectory: "../../coverage/packages/playwright-reporter-llm",
  testExclude: ["test/e2e/fixtures/**", "test/e2e/playwright.config.ts"],
});
