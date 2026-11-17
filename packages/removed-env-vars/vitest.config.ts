import { definePackageVitestConfig } from "../../vitest.preset";

export default definePackageVitestConfig({
  coverageThresholds: {
    branches: 85,
    functions: 95,
    lines: 90,
    statements: 90,
  },
  coverageExclude: ["src/bin/cli.ts"],
  name: "removed-env-vars",
  reportsDirectory: "../../coverage/packages/removed-env-vars",
});
