import { definePackageVitestConfig } from "../../vitest.preset";

export default definePackageVitestConfig({
  coverageThresholds: null,
  name: "ai-rules",
  passWithNoTests: true,
  reportsDirectory: "../../coverage/packages/ai-rules",
});
