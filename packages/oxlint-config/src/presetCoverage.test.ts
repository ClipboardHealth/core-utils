import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";

import { createOxlintConfig, frontend, typeAware, vitest } from "./index";

const OXLINT_CLI = path.join(
  path.dirname(createRequire(__filename).resolve("oxlint/package.json")),
  "bin/oxlint",
);

const FRONTEND_RULES = {
  "oxc/bad-array-method-on-arguments": "deny",
  "typescript/no-useless-empty-export": "deny",
  "unicorn/no-invalid-fetch-options": "deny",
};

const TYPE_AWARE_RULES = {
  "typescript/await-thenable": "deny",
  "typescript/no-base-to-string": "deny",
  "typescript/no-floating-promises": "deny",
  "typescript/no-misused-spread": "deny",
  "typescript/no-redundant-type-constituents": "deny",
  "typescript/restrict-template-expressions": "deny",
  "typescript/unbound-method": "deny",
};

describe("standalone preset coverage", () => {
  it.each([
    {
      name: "frontend",
      presets: [frontend],
      expectedPlugins: ["react", "jsx-a11y", "import", "oxc", "typescript", "unicorn"],
      expectedRules: FRONTEND_RULES,
    },
    {
      name: "typeAware",
      presets: [typeAware],
      expectedPlugins: ["typescript"],
      expectedRules: TYPE_AWARE_RULES,
    },
    {
      name: "typeAware/vitest composition",
      presets: [typeAware, vitest],
      expectedPlugins: ["typescript", "vitest"],
      expectedRules: TYPE_AWARE_RULES,
    },
    {
      name: "documented frontend/typeAware/vitest composition",
      presets: [frontend, typeAware, vitest],
      expectedPlugins: ["react", "jsx-a11y", "import", "oxc", "typescript", "unicorn", "vitest"],
      expectedRules: { ...FRONTEND_RULES, ...TYPE_AWARE_RULES },
    },
  ])("enforces the declared built-in plugins and rules for $name", (input) => {
    const directory = mkdtempSync(path.join(tmpdir(), "oxlint-preset-coverage-"));
    const configPath = path.join(directory, ".oxlintrc.json");

    try {
      const config = createOxlintConfig({ presets: input.presets });
      // React Doctor is optional; this fixture checks built-in plugin registration without it.
      config.jsPlugins = [];
      config.rules = Object.fromEntries(
        Object.entries(config.rules ?? {}).filter(([rule]) => !rule.startsWith("react-doctor/")),
      );
      writeFileSync(configPath, JSON.stringify(config));

      const actual: unknown = JSON.parse(
        execFileSync(process.execPath, [OXLINT_CLI, "--config", configPath, "--print-config"], {
          cwd: directory,
          encoding: "utf8",
        }),
      );

      expect(actual).toMatchObject({
        plugins: expect.arrayContaining(input.expectedPlugins),
        rules: expect.objectContaining(input.expectedRules),
      });
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
