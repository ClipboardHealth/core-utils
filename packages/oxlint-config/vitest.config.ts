import { definePackageVitestConfig } from "../../vitest.preset";

export default definePackageVitestConfig({
  name: "oxlint-config",
  passWithNoTests: true,
  reportsDirectory: "../../coverage/packages/oxlint-config",
});
