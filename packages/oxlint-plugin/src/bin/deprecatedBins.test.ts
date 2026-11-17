import { spawnSync } from "node:child_process";
import path from "node:path";

const WORKSPACE_ROOT = path.resolve(__dirname, "../../../..");
// The aliases are scripts that run on import, so these tests run the build that `test` depends on.
const BIN_DIRECTORY = path.join(WORKSPACE_ROOT, "dist/packages/oxlint-plugin/src/bin");

describe("deprecated cbh-* bins", () => {
  it.each([
    ["deprecatedCheckSuppressions.js", "cbh-check-suppressions", "cb-check-suppressions"],
    ["deprecatedLintCeilings.js", "cbh-lint-ceilings", "cb-lint-ceilings"],
  ])("%s warns on stderr and runs the %s CLI", (file, oldName, newName) => {
    const result = spawnSync(process.execPath, [path.join(BIN_DIRECTORY, file), "--help"], {
      encoding: "utf8",
    });

    expect(result.stderr).toContain(
      `${oldName} is deprecated and will be removed; use ${newName}.\n`,
    );
    expect(result.stdout).toContain(`Usage: ${newName}`);
    expect(result.status).toBe(0);
  });
});
