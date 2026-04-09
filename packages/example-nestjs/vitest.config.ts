import { definePackageVitestConfig } from "../../vitest.preset";

export default definePackageVitestConfig({
  coverageThresholds: null,
  name: "example-nestjs",
  reportsDirectory: "../../coverage/packages/example-nestjs",
});
