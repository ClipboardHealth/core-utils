import { readFileSync } from "node:fs";
import path from "node:path";

import type { AllowWarnDeny, DummyRule, DummyRuleMap, OxlintConfig, OxlintOverride } from "oxlint";

import type { OxlintPreset } from "./types";

const JEST_RULES: DummyRuleMap = {
  "jest/max-expects": "off",
  "jest/max-nested-describe": "off",
  "jest/no-hooks": "off",
  "jest/prefer-lowercase-title": "off",
  "jest/valid-title": ["error", { ignoreTypeOfDescribeName: true }],
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
export const jest: OxlintPreset = {
  plugins: ["jest"],
  rules: JEST_RULES,
};
export const vitest: OxlintPreset = createVitestPreset();

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

    throw new Error(`Unsupported oxlint plugin "${plugin}" in base.json.`);
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
