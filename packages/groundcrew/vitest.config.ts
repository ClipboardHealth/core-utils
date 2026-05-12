import { definePackageVitestConfig } from "../../vitest.preset";

export default definePackageVitestConfig({
  name: "groundcrew",
  reportsDirectory: "../../coverage/packages/groundcrew",
  coverageExclude: ["src/testHelpers/**"],
});
