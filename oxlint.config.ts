import { base, createOxlintConfig, jest } from "./dist/packages/oxlint-config/src/index.js";
import { defineConfig, type OxlintConfig, type OxlintOverride } from "oxlint";

const SCRIPTS_OVERRIDE: OxlintOverride = {
  files: [
    "**/.claude/**/*.ts",
    "**/examples/**/*.js",
    "**/examples/**/*.ts",
    "**/plugins/**/*.ts",
    "**/scripts/**/*.js",
    "**/scripts/**/*.ts",
    "populateLibraries.ts",
  ],
  rules: {
    "no-console": "off",
  },
};

const NX_PLUGIN_OVERRIDE: OxlintOverride = {
  files: ["packages/nx-plugin/src/index.ts"],
  rules: {
    "unicorn/no-empty-file": "off",
  },
};

const EMBEDEX_OVERRIDE: OxlintOverride = {
  files: ["packages/embedex/src/bin/**/*.ts"],
  rules: {
    "no-console": "off",
  },
};

export default defineConfig(createCoreUtilsOxlintConfig());

function createCoreUtilsOxlintConfig(): OxlintConfig {
  return createOxlintConfig({
    localConfig: {
      ignorePatterns: [
        ".agents",
        "coverage/",
        "dist/",
        "node_modules/",
        "packages/eslint-config/src/index.js",
      ],
      options: {
        reportUnusedDisableDirectives: "off",
      },
      overrides: [SCRIPTS_OVERRIDE, NX_PLUGIN_OVERRIDE, EMBEDEX_OVERRIDE],
      rules: {
        "class-methods-use-this": "off",
        complexity: "off",
        "func-names": "off",
        "func-style": "off",
        "import/max-dependencies": "off",
        "import/no-anonymous-default-export": "off",
        "import/no-commonjs": "off",
        "import/no-default-export": "off",
        "import/no-namespace": "off",
        "import/no-unassigned-import": "off",
        "import/unambiguous": "off",
        "jest/max-expects": "off",
        "jest/max-nested-describe": "off",
        "jest/no-confusing-set-timeout": "off",
        "jest/no-conditional-in-test": "off",
        "jest/no-hooks": "off",
        "jest/no-unneeded-async-expect-function": "off",
        "jest/no-untyped-mock-factory": "off",
        "jest/padding-around-test-blocks": "off",
        "jest/prefer-called-with": "off",
        "jest/prefer-expect-resolves": "off",
        "jest/prefer-jest-mocked": "off",
        "jest/prefer-lowercase-title": "off",
        "jest/prefer-mock-return-shorthand": "off",
        "jest/prefer-strict-equal": "off",
        "jest/require-hook": "off",
        "jest/require-to-throw-message": "off",
        "jsdoc/check-tag-names": "off",
        "jsdoc/empty-tags": "off",
        "jsdoc/require-param": "off",
        "jsdoc/require-param-type": "off",
        "jsdoc/require-returns": "off",
        "jsdoc/require-returns-type": "off",
        "max-classes-per-file": "off",
        "max-depth": "off",
        "max-lines": "off",
        "max-lines-per-function": "off",
        "max-params": "off",
        "new-cap": "off",
        "no-continue": "off",
        "no-duplicate-imports": "off",
        "no-inline-comments": "off",
        "no-plusplus": "off",
        "no-shadow": "off",
        "node/no-process-env": "off",
        "oxc/no-accumulating-spread": "off",
        "oxc/no-barrel-file": "off",
        "oxc/no-map-spread": "off",
        "prefer-destructuring": "off",
        "prefer-promise-reject-errors": "off",
        "prefer-template": "off",
        "promise/always-return": "off",
        "promise/prefer-await-to-then": "off",
        "sort-imports": "off",
        "sort-keys": "off",
        "typescript/array-type": "off",
        "typescript/ban-types": "off",
        "typescript/dot-notation": "off",
        "typescript/explicit-function-return-type": "off",
        "typescript/explicit-module-boundary-types": "off",
        "typescript/no-extraneous-class": "off",
        "typescript/no-import-type-side-effects": "off",
        "typescript/no-invalid-void-type": "off",
        "typescript/no-non-null-assertion": "off",
        "typescript/no-require-imports": "off",
        "typescript/no-unsafe-type-assertion": "off",
        "typescript/parameter-properties": "off",
        "typescript/prefer-includes": "off",
        "typescript/prefer-regexp-exec": "off",
        "typescript/strict-boolean-expressions": "off",
        "unicorn/consistent-function-scoping": "off",
        "unicorn/no-anonymous-default-export": "off",
        "unicorn/no-array-callback-reference": "off",
        "unicorn/no-array-for-each": "off",
        "unicorn/no-array-reduce": "off",
        "unicorn/no-array-sort": "off",
        "unicorn/no-immediate-mutation": "off",
        "unicorn/no-instanceof-builtins": "off",
        "unicorn/prefer-bigint-literals": "off",
        "unicorn/prefer-module": "off",
        "unicorn/prefer-string-raw": "off",
        "unicorn/prefer-top-level-await": "off",
      },
      settings: {
        node: {
          version: ">=24.14.1",
        },
      },
    },
    presets: [base, jest],
  });
}
