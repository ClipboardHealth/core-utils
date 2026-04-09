import { definePackageVitestConfig } from "../../vitest.preset";

export default definePackageVitestConfig({
  name: "notifications",
  reportsDirectory: "../../coverage/packages/notifications",
  serverDepsInline: ["jose"],
});
