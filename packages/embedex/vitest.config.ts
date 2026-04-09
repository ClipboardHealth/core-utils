import { definePackageVitestConfig } from "../../vitest.preset";

export default definePackageVitestConfig({
  coverageExclude: ["src/bin/cli.ts"],
  name: "embedex",
  reportsDirectory: "../../coverage/packages/embedex",
});
