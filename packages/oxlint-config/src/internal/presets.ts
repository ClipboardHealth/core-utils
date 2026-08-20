import { readFileSync } from "node:fs";
import path from "node:path";

import type { AllowWarnDeny, DummyRule, DummyRuleMap, OxlintConfig, OxlintOverride } from "oxlint";

import type { OxlintPreset } from "./types";

const JEST_RULES: DummyRuleMap = {
  "max-lines": ["error", { max: 2000 }],
  "jest/max-expects": "off",
  "jest/max-nested-describe": "off",
  // False-positive explosion: flags spec files that contain no setTimeout call at all
  // when a setup file calls jest.setTimeout (265k diagnostics across 764 clean files
  // in clipboard-health as of oxlint 1.60).
  "jest/no-confusing-set-timeout": "off",
  "jest/no-hooks": "off",
  "jest/prefer-ending-with-an-expect": "off",
  "jest/prefer-expect-assertions": "off",
  "jest/prefer-importing-jest-globals": "off",
  "jest/prefer-lowercase-title": "off",
  "jest/valid-title": ["error", { ignoreTypeOfDescribeName: true }],
} as const;

const FRONTEND_RULES: DummyRuleMap = {
  "jsx-a11y/anchor-has-content": "error",
  "jsx-a11y/aria-props": "error",
  "jsx-a11y/aria-proptypes": "error",
  "jsx-a11y/aria-role": "error",
  "jsx-a11y/aria-unsupported-elements": "error",
  "jsx-a11y/control-has-associated-label": "error",
  "jsx-a11y/heading-has-content": "error",
  "jsx-a11y/iframe-has-title": "error",
  "jsx-a11y/img-redundant-alt": "error",
  "jsx-a11y/interactive-supports-focus": "error",
  "jsx-a11y/no-access-key": "error",
  "jsx-a11y/no-distracting-elements": "error",
  "jsx-a11y/no-redundant-roles": "error",
  "jsx-a11y/prefer-tag-over-role": "off",
  "jsx-a11y/role-has-required-aria-props": "error",
  "jsx-a11y/role-supports-aria-props": "error",
  "jsx-a11y/scope": "error",
  "react/exhaustive-deps": "warn",
  "react/jsx-filename-extension": ["warn", { extensions: [".tsx", ".jsx"] }],
  "react/jsx-no-comment-textnodes": "error",
  "react/jsx-no-duplicate-props": "error",
  "react/jsx-no-undef": "error",
  "react/jsx-pascal-case": ["error", { allowAllCaps: true }],
  "react/no-danger-with-children": "error",
  "react/no-did-update-set-state": "error",
  "react/no-direct-mutation-state": "error",
  "react/no-is-mounted": "error",
  "react/require-render-return": "error",
  "react/rules-of-hooks": "error",
  "react/style-prop-object": "error",
} as const;

const FRONTEND_JAVASCRIPT_RULES: DummyRuleMap = {
  curly: ["error", "all"],
  eqeqeq: ["error", "always"],
  "getter-return": "error",
  "no-array-constructor": "error",
  "no-caller": "error",
  "no-cond-assign": ["error", "except-parens"],
  "no-const-assign": "error",
  "no-control-regex": "error",
  "no-debugger": "error",
  "no-delete-var": "error",
  "no-dupe-keys": "error",
  "no-duplicate-case": "error",
  "no-empty": "error",
  "no-empty-character-class": "error",
  "no-empty-pattern": "error",
  "no-eval": "error",
  "no-ex-assign": "error",
  "no-extra-bind": "error",
  "no-fallthrough": "error",
  "no-func-assign": "error",
  "no-implied-eval": "error",
  "no-invalid-regexp": "error",
  "no-irregular-whitespace": "error",
  "no-labels": ["error", { allowLoop: true, allowSwitch: false }],
  "no-new-func": "error",
  "no-new-wrappers": "error",
  "no-obj-calls": "error",
  "no-redeclare": "error",
  "no-regex-spaces": "error",
  "no-self-assign": "error",
  "no-self-compare": "error",
  "no-shadow-restricted-names": "error",
  "no-sparse-arrays": "error",
  "no-template-curly-in-string": "error",
  "no-this-before-super": "error",
  "no-throw-literal": "error",
  "no-unexpected-multiline": "error",
  "no-unreachable": "error",
  "no-unused-labels": "error",
  "no-useless-escape": "error",
  "no-warning-comments": "off",
  "no-with": "error",
  "require-yield": "error",
  "unicode-bom": ["error", "never"],
  "use-isnan": "error",
  "valid-typeof": "error",
} as const;

const TYPE_AWARE_RULES: DummyRuleMap = {
  "typescript/await-thenable": "error",
  "typescript/no-base-to-string": "error",
  "typescript/no-floating-promises": "error",
  "typescript/no-misused-spread": "error",
  "typescript/no-redundant-type-constituents": "error",
  "typescript/restrict-template-expressions": "error",
  "typescript/unbound-method": "error",
} as const;

const VITEST_SAFETY_RULES: DummyRuleMap = {
  "vitest/no-conditional-expect": "off",
  "vitest/no-disabled-tests": "error",
  "vitest/no-focused-tests": "error",
  "vitest/require-mock-type-parameters": "off",
  "vitest/require-to-throw-message": "error",
  "vitest/valid-expect": "error",
} as const;

// See https://oxc.rs/docs/guide/usage/linter/plugins.html#supported-plugins
const OXLINT_PLUGIN_NAMES = {
  eslint: "eslint",
  import: "import",
  jest: "jest",
  jsdoc: "jsdoc",
  "jsx-a11y": "jsx-a11y",
  nextjs: "nextjs",
  node: "node",
  oxc: "oxc",
  promise: "promise",
  react: "react",
  "react-perf": "react-perf",
  typescript: "typescript",
  unicorn: "unicorn",
  vitest: "vitest",
  vue: "vue",
} as const;

type OxlintPluginName = NonNullable<OxlintConfig["plugins"]>[number];

interface BaseJsonOverride {
  files: string[];
  rules?: NonNullable<OxlintOverride["rules"]>;
}

interface BaseJsonConfig {
  categories?: NonNullable<OxlintPreset["categories"]>;
  ignorePatterns?: NonNullable<OxlintPreset["ignorePatterns"]>;
  options?: NonNullable<OxlintPreset["options"]>;
  overrides: BaseJsonOverride[];
  plugins: string[];
  rules: NonNullable<OxlintPreset["rules"]>;
  settings?: NonNullable<OxlintPreset["settings"]>;
}

export const base = createBasePreset();
export const react: OxlintPreset = {
  plugins: ["react"],
};
export const frontend: OxlintPreset = {
  plugins: ["react", "jsx-a11y", "import"],
  rules: {
    ...FRONTEND_RULES,
    ...FRONTEND_JAVASCRIPT_RULES,
  },
};
export const jest: OxlintPreset = {
  plugins: ["jest"],
  rules: JEST_RULES,
};
export const typeAware: OxlintPreset = {
  rules: TYPE_AWARE_RULES,
};
export const vitest: OxlintPreset = createVitestPreset();
export const vitestSafety: OxlintPreset = {
  plugins: ["vitest"],
  rules: VITEST_SAFETY_RULES,
};
export const customRules: OxlintPreset = {
  jsPlugins: [
    {
      name: "@clipboard-health",
      specifier: "@clipboard-health/oxlint-plugin",
    },
  ],
  overrides: [
    {
      files: ["**/*.controller.ts", "**/*.controllers.ts"],
      rules: {
        "@clipboard-health/enforce-ts-rest-in-controllers": "error",
      },
    },
    {
      files: ["**/*.module.ts"],
      rules: {
        "@clipboard-health/require-http-module-factory": "error",
      },
    },
    {
      files: ["**/*.contract.ts"],
      rules: {
        "@clipboard-health/require-zod-import-in-contracts": "error",
      },
    },
    {
      files: ["**/*.ts", "**/*.tsx"],
      rules: {
        "@clipboard-health/no-cross-contract-imports": "error",
      },
    },
  ],
};
export const contractFixtures: OxlintPreset = {
  jsPlugins: [
    {
      name: "contract-fixtures",
      specifier: "@clipboard-health/oxlint-plugin",
    },
  ],
  overrides: [
    {
      files: [
        "**/{testUtils,test-utils}/{handlers,mocks}*.{cjs,cts,js,jsx,mjs,mts,ts,tsx}",
        "**/testHandlers.{cjs,cts,js,jsx,mjs,mts,ts,tsx}",
        "**/*.{spec,test}.{cjs,cts,js,jsx,mjs,mts,ts,tsx}",
        "playwright/**/*.{cjs,cts,js,jsx,mjs,mts,ts,tsx}",
      ],
      rules: {
        "contract-fixtures/require-contract-fixture-construction": "warn",
      },
    },
  ],
};

function createBasePreset(): OxlintPreset {
  const parsedBaseJson = loadBaseJson();
  const preset: OxlintPreset = {
    overrides: parsedBaseJson.overrides.map(createOverride),
    plugins: normalizePlugins(parsedBaseJson.plugins),
    rules: parsedBaseJson.rules,
  };

  if (parsedBaseJson.categories !== undefined) {
    preset.categories = parsedBaseJson.categories;
  }

  if (parsedBaseJson.ignorePatterns !== undefined) {
    preset.ignorePatterns = parsedBaseJson.ignorePatterns;
  }

  if (parsedBaseJson.options !== undefined) {
    preset.options = parsedBaseJson.options;
  }

  if (parsedBaseJson.settings !== undefined) {
    preset.settings = parsedBaseJson.settings;
  }

  return preset;
}

function createOverride(override: BaseJsonOverride): OxlintOverride {
  const normalizedOverride: OxlintOverride = {
    files: [...override.files],
  };

  if (override.rules !== undefined) {
    normalizedOverride.rules = override.rules;
  }

  return normalizedOverride;
}

function isOxlintPluginName(plugin: string): plugin is OxlintPluginName {
  return Object.hasOwn(OXLINT_PLUGIN_NAMES, plugin);
}

function normalizePlugins(plugins: string[]): OxlintPluginName[] {
  return plugins.map((plugin) => {
    if (isOxlintPluginName(plugin)) {
      return plugin;
    }

    throw new Error(`Unsupported oxlint plugin "${plugin}".`);
  });
}

function createVitestPreset(): OxlintPreset {
  const vitestJsonPath = path.resolve(__dirname, "../vitest.json");
  const json = parseUnknownJson(readFileSync(vitestJsonPath, "utf8"));

  if (!isPlainObject(json) || !isStringArray(json["plugins"]) || !isRuleMap(json["rules"])) {
    throw new Error("The bundled vitest.json file is not a valid oxlint config preset.");
  }

  return {
    plugins: normalizePlugins(json["plugins"].filter((p) => !base.plugins?.some((bp) => bp === p))),
    rules: json["rules"],
  };
}

function loadBaseJson(): BaseJsonConfig {
  const baseJsonPath = path.resolve(__dirname, "../base.json");
  const json = parseUnknownJson(readFileSync(baseJsonPath, "utf8"));

  if (isBaseJsonConfig(json)) {
    return json;
  }

  throw new Error("The bundled base.json file is not a valid oxlint config preset.");
}

function parseUnknownJson(json: string): unknown {
  return JSON.parse(json) as unknown;
}

function isBaseJsonConfig(value: unknown): value is BaseJsonConfig {
  if (!isPlainObject(value)) {
    return false;
  }

  const { categories, ignorePatterns, options, settings } = value;

  return (
    isStringArray(value["plugins"]) &&
    isRuleMap(value["rules"]) &&
    isOverrideArray(value["overrides"]) &&
    (categories === undefined || isCategoryMap(categories)) &&
    (ignorePatterns === undefined || isStringArray(ignorePatterns)) &&
    (options === undefined || isPlainObject(options)) &&
    (settings === undefined || isPlainObject(settings))
  );
}

function isOverrideArray(value: unknown): value is BaseJsonOverride[] {
  return Array.isArray(value) && value.every(isBaseJsonOverride);
}

function isBaseJsonOverride(value: unknown): value is BaseJsonOverride {
  if (!isPlainObject(value)) {
    return false;
  }

  const { files, rules } = value;
  return isStringArray(files) && (rules === undefined || isRuleMap(rules));
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isCategoryMap(value: unknown): value is NonNullable<OxlintPreset["categories"]> {
  if (!isPlainObject(value)) {
    return false;
  }

  return Object.values(value).every(isAllowWarnDeny);
}

function isRuleMap(value: unknown): value is NonNullable<OxlintPreset["rules"]> {
  if (!isPlainObject(value)) {
    return false;
  }

  return Object.values(value).every(isDummyRule);
}

function isDummyRule(value: unknown): value is DummyRule {
  return isAllowWarnDeny(value) || isRuleTuple(value);
}

function isRuleTuple(value: unknown): value is [AllowWarnDeny, ...unknown[]] {
  return Array.isArray(value) && value.length > 0 && isAllowWarnDeny(value[0]);
}

function isAllowWarnDeny(value: unknown): value is AllowWarnDeny {
  return (
    value === 0 ||
    value === 1 ||
    value === 2 ||
    value === "allow" ||
    value === "off" ||
    value === "warn" ||
    value === "error" ||
    value === "deny"
  );
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}
