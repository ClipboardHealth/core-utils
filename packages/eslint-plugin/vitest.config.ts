import { definePackageVitestConfig } from "../../vitest.preset";

export default definePackageVitestConfig({
  coverageThresholds: {
    branches: 0,
    functions: 0,
    lines: 0,
    statements: 0,
  },
  name: "eslint-plugin",
  reportsDirectory: "../../coverage/packages/eslint-plugin",
});
