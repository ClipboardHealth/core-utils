import { definePackageVitestConfig } from "../../vitest.preset";

export default definePackageVitestConfig({
  name: "clearance",
  reportsDirectory: "../../coverage/packages/clearance",
  coverageExclude: ["src/cli.ts", "src/ensureCli.ts"],
});
