import { mkdirSync, mkdtempSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { checkNeverSuppressRules } from "./checkNeverSuppressRules";
import { NEVER_SUPPRESS_RULES } from "./internal/suppressionPolicy";

const WORKSPACE_ROOT = path.resolve(__dirname, "../../../..");
// Oxlint loads JavaScript plugins as JavaScript, so these tests use the build that `test` depends on.
const PLUGIN = path.join(WORKSPACE_ROOT, "dist/packages/oxlint-plugin/src/index.js");

describe("checkNeverSuppressRules", () => {
  let repository: string;

  beforeEach(() => {
    repository = mkdtempSync(path.join(tmpdir(), "never-suppress-"));
    symlinkSync(path.join(WORKSPACE_ROOT, "node_modules"), path.join(repository, "node_modules"));
    mkdirSync(path.join(repository, "src"));
  });

  afterEach(() => {
    rmSync(repository, { force: true, recursive: true });
  });

  it("returns no rules when the policy is enabled", () => {
    writeConfig({ rules: { "@clipboard-health/suppression-policy": "error" } });

    expect(checkNeverSuppressRules({ cwd: repository, directory: "src" })).toStrictEqual({
      unenforcedRules: [],
    });
  });

  it("returns every rule when the policy is not enabled", () => {
    writeConfig({ rules: {} });

    expect(checkNeverSuppressRules({ cwd: repository, directory: "src" })).toStrictEqual({
      unenforcedRules: NEVER_SUPPRESS_RULES,
    });
  });

  it("returns every rule when an override turns the policy off for the directory", () => {
    writeConfig({
      rules: { "@clipboard-health/suppression-policy": "error" },
      overrides: [{ files: ["src/**"], rules: { "@clipboard-health/suppression-policy": "off" } }],
    });

    expect(checkNeverSuppressRules({ cwd: repository, directory: "src" })).toStrictEqual({
      unenforcedRules: NEVER_SUPPRESS_RULES,
    });
  });

  it("returns no rules when a single-level files pattern enables the policy for the directory", () => {
    writeConfig({
      overrides: [
        { files: ["src/*.ts"], rules: { "@clipboard-health/suppression-policy": "error" } },
      ],
    });

    expect(checkNeverSuppressRules({ cwd: repository, directory: "src" })).toStrictEqual({
      unenforcedRules: [],
    });
  });

  it("leaves no probe file behind", () => {
    writeConfig({ rules: { "@clipboard-health/suppression-policy": "error" } });

    checkNeverSuppressRules({ cwd: repository, directory: "src" });

    expect(readdirSync(path.join(repository, "src"))).toStrictEqual([]);
  });

  function writeConfig(config: Record<string, unknown>): void {
    writeFileSync(
      path.join(repository, ".oxlintrc.json"),
      JSON.stringify({
        categories: { correctness: "off" },
        jsPlugins: [{ name: "@clipboard-health", specifier: PLUGIN }],
        plugins: [],
        ...config,
      }),
    );
  }
});
