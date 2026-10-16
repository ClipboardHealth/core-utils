import { definePackageVitestConfig } from "../../vitest.preset";

export default definePackageVitestConfig({
  coverageExclude: ["src/bin/oxlintChanged.ts"],
  name: "oxlint-config",
  passWithNoTests: true,
  reportsDirectory: "../../coverage/packages/oxlint-config",
});
