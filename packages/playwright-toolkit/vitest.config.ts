import { definePackageVitestConfig } from "../../vitest.preset";

export default definePackageVitestConfig({
  coverageThresholds: {
    branches: 65,
    functions: 85,
    lines: 75,
    statements: 75,
  },
  name: "playwright-toolkit",
  reportsDirectory: "../../coverage/packages/playwright-toolkit",
});
