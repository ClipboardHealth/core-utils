import type { OxlintConfig } from "oxlint";

import type { CreateOxlintConfigRequest, OxlintPreset } from "./types";

export function createOxlintConfig(request: CreateOxlintConfigRequest): OxlintConfig {
  const { localConfig, presets = [] } = request;
  const configChain = localConfig === undefined ? [...presets] : [...presets, localConfig];

  let config: OxlintConfig = {};

  for (const preset of configChain) {
    config = mergeOxlintPreset({
      current: config,
      next: preset,
    });
  }

  return config;
}

function mergeOxlintPreset(request: { current: OxlintConfig; next: OxlintPreset }): OxlintConfig {
  const { current, next } = request;
  const config: OxlintConfig = {};

  assignMergedValue({
    config,
    field: "categories",
    value: mergeObjectValues(current.categories, next.categories),
  });
  assignMergedValue({
    config,
    field: "env",
    value: mergeObjectValues(current.env, next.env),
  });
  assignMergedValue({
    config,
    field: "globals",
    value: mergeObjectValues(current.globals, next.globals),
  });
  assignMergedValue({
    config,
    field: "ignorePatterns",
    value: mergeArrayValues(current.ignorePatterns, next.ignorePatterns),
  });
  assignMergedValue({
    config,
    field: "jsPlugins",
    value: mergeArrayValues(current.jsPlugins ?? undefined, next.jsPlugins ?? undefined),
  });
  assignMergedValue({
    config,
    field: "options",
    value: mergeObjectValues(current.options, next.options),
  });
  assignMergedValue({
    config,
    field: "overrides",
    value: mergeArrayValues(current.overrides, next.overrides),
  });
  assignMergedValue({
    config,
    field: "plugins",
    value: mergeArrayValues(current.plugins, next.plugins),
  });
  assignMergedValue({
    config,
    field: "rules",
    value: mergeObjectValues(current.rules, next.rules),
  });
  assignMergedValue({
    config,
    field: "settings",
    value: mergeSettingsValues(current.settings, next.settings),
  });

  return config;
}

function mergeArrayValues<Item>(
  current: readonly Item[] | undefined,
  next: readonly Item[] | undefined,
): Item[] | undefined {
  if (current === undefined) {
    return next === undefined ? undefined : cloneValue([...next]);
  }

  return next === undefined ? cloneValue([...current]) : cloneValue([...current, ...next]);
}

function mergeObjectValues<Value extends object>(
  current: Value | undefined,
  next: Value | undefined,
): Value | undefined {
  if (current === undefined) {
    return next === undefined ? undefined : cloneValue(next);
  }

  return next === undefined ? cloneValue(current) : cloneValue({ ...current, ...next });
}

function mergeSettingsValues(
  current: OxlintConfig["settings"],
  next: OxlintConfig["settings"],
): OxlintConfig["settings"] {
  if (current === undefined) {
    return next === undefined ? undefined : cloneValue(next);
  }

  if (next === undefined) {
    return cloneValue(current);
  }

  const merged = { ...current };
  for (const [namespace, nextValue] of Object.entries(next)) {
    const currentValue = merged[namespace];
    merged[namespace] =
      isPlainObject(currentValue) && isPlainObject(nextValue)
        ? { ...currentValue, ...nextValue }
        : nextValue;
  }

  return cloneValue(merged);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function cloneValue<Value>(value: Value): Value {
  return structuredClone(value);
}

function assignMergedValue<Field extends keyof OxlintConfig>(request: {
  config: OxlintConfig;
  field: Field;
  value: OxlintConfig[Field] | undefined;
}): void {
  const { config, field, value } = request;

  if (value !== undefined) {
    config[field] = value;
  }
}
