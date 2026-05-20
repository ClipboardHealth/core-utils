import { definePackageVitestConfig } from "../../vitest.preset";

export default definePackageVitestConfig({
  coverageThresholds: null,
  name: "tribunal",
  reportsDirectory: "../../coverage/packages/tribunal",
});
