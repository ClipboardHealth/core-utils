import { definePackageVitestConfig } from "../../vitest.preset";

export default definePackageVitestConfig({
  coverageThresholds: {
    branches: 80,
    functions: 80,
    lines: 80,
    statements: 80,
  },
  name: "mongo-jobs",
  reportsDirectory: "../../coverage/packages/mongo-jobs",
});
