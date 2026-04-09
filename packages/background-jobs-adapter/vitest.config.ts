import { definePackageVitestConfig } from "../../vitest.preset";

export default definePackageVitestConfig({
  coverageThresholds: null,
  name: "background-jobs-adapter",
  passWithNoTests: true,
  reportsDirectory: "../../coverage/packages/background-jobs-adapter",
});
