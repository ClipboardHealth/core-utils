import { definePackageVitestConfig } from "../../vitest.preset";

export default definePackageVitestConfig({
  coverageThresholds: null,
  name: "eslint-config",
  passWithNoTests: true,
  reportsDirectory: "../../coverage/packages/eslint-config",
});
