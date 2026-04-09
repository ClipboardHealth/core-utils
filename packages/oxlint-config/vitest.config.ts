import { definePackageVitestConfig } from "../../vitest.preset";

export default definePackageVitestConfig({
  coverageThresholds: null,
  name: "oxlint-config",
  passWithNoTests: true,
  reportsDirectory: "../../coverage/packages/oxlint-config",
});
