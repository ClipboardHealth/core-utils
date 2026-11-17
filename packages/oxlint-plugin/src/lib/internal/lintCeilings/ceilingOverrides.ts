import path from "node:path";

import { isPlainObject } from "../json";
import { type CeilingRule, getCeilingRule } from "./ceilingRules";
import { compareStrings, type LintCeilings, parseLintCeilings } from "./ceilingsFile";

/** Set to `ignore` to make createLintCeilingOverrides return nothing, so the defaults show. */
export const LINT_CEILINGS_ENV = "CB_LINT_CEILINGS";

/**
 * The name before the rename. The CLI still sets it so an older plugin copy in the config honors it,
 * and this plugin still honors it so an older CLI works with this copy.
 */
export const LEGACY_LINT_CEILINGS_ENV = "CBH_LINT_CEILINGS";

/** The parts of an Oxlint configuration that decide whether and how a rule applies to a file. */
export interface CeilingConfig {
  categories?: Readonly<Partial<Record<CeilingRule["category"], unknown>>> | undefined;
  overrides?:
    | ReadonlyArray<{
        excludeFiles?: readonly string[] | undefined;
        files: readonly string[];
        rules?: Readonly<Record<string, unknown>> | undefined;
      }>
    | undefined;
  plugins?: readonly string[] | null | undefined;
  rules?: Readonly<Record<string, unknown>> | undefined;
}

export interface CeilingOverride {
  files: string[];
  rules: Record<string, [Severity, Record<string, unknown>]>;
}

type Severity = "error" | "warn";

const DOT_STAND_IN = "\uE000";
type RuleSetting = "off" | { options: Record<string, unknown>; severity: Severity };

/**
 * Returns one override per file in `ceilings`, to append after every other override: Oxlint applies
 * the last matching override, so an earlier ceiling loses to a later glob such as a test preset.
 * Each pattern starts with `./`, because Oxlint matches a slashless pattern in every directory.
 * Each keeps the severity and options the file would otherwise get, because an override replaces
 * a rule's options rather than merging them, and skips rules that are off for the file.
 */
export function createLintCeilingOverrides(params: {
  ceilings: unknown;
  config: CeilingConfig;
  env?: Readonly<Record<string, string | undefined>>;
}): { overrides: CeilingOverride[] } {
  const { config, env = process.env } = params;
  if (env[LINT_CEILINGS_ENV] === "ignore" || env[LEGACY_LINT_CEILINGS_ENV] === "ignore") {
    return { overrides: [] };
  }

  const ceilings: LintCeilings = parseLintCeilings({ value: params.ceilings });
  const byFile = new Map<string, CeilingOverride["rules"]>();
  for (const [ruleName, entries] of Object.entries(ceilings.rules)) {
    for (const [file, max] of Object.entries(entries)) {
      const setting = resolveRuleSetting({ config, file, ruleName });
      if (setting !== "off") {
        const rules = byFile.get(file) ?? {};
        rules[ruleName] = [setting.severity, { ...setting.options, max }];
        byFile.set(file, rules);
      }
    }
  }

  return {
    overrides: [...byFile.entries()]
      .toSorted(([left], [right]) => compareStrings(left, right))
      .map(([file, rules]) => ({ files: [`./${escapeGlob(file)}`], rules })),
  };
}

/** Resolves the rule's setting for `file` as Oxlint does: category, then rules, then overrides. */
function resolveRuleSetting(params: {
  config: CeilingConfig;
  file: string;
  ruleName: string;
}): RuleSetting {
  const { config, file, ruleName } = params;
  const ceilingRule = getCeilingRule(ruleName);
  let setting = categorySetting({ ceilingRule, config });
  setting = findRuleSetting({ ceilingRule, ruleName, rules: config.rules }) ?? setting;
  for (const override of config.overrides ?? []) {
    const matches = (pattern: string): boolean => matchesOxlintGlob({ file, pattern });
    if (override.files.some(matches) && !(override.excludeFiles ?? []).some(matches)) {
      setting = findRuleSetting({ ceilingRule, ruleName, rules: override.rules }) ?? setting;
    }
  }

  return setting;
}

function categorySetting(params: { ceilingRule: CeilingRule; config: CeilingConfig }): RuleSetting {
  const { ceilingRule, config } = params;
  const pluginEnabled =
    ceilingRule.plugin === "eslint" || (config.plugins ?? []).includes(ceilingRule.plugin);
  const severity = pluginEnabled ? config.categories?.[ceilingRule.category] : undefined;
  return severity === undefined ? "off" : toSetting({ value: severity });
}

function findRuleSetting(params: {
  ceilingRule: CeilingRule;
  ruleName: string;
  rules: Readonly<Record<string, unknown>> | undefined;
}): RuleSetting | undefined {
  const { ceilingRule, ruleName, rules = {} } = params;
  let setting: RuleSetting | undefined;
  for (const [key, value] of Object.entries(rules)) {
    if (key === ruleName || ceilingRule.aliases.includes(key)) {
      setting = toSetting({ value });
    }
  }

  return setting;
}

function toSetting(params: { value: unknown }): RuleSetting {
  const { value } = params;
  const [severityValue, option]: unknown[] = Array.isArray(value) ? value : [value];
  const severity = toSeverity({ value: severityValue });
  if (severity === "off") {
    return "off";
  }

  if (typeof option === "number") {
    return { options: { max: option }, severity };
  }

  if (!isPlainObject(option)) {
    return { options: {}, severity };
  }

  // Oxlint reads `maximum` as `max` and rejects a configuration that sets both.
  const { maximum, ...options } = option;
  return { options: maximum === undefined ? options : { ...options, max: maximum }, severity };
}

function toSeverity(params: { value: unknown }): Severity | "off" {
  switch (params.value) {
    case "off":
    case "allow":
    case 0: {
      return "off";
    }

    case "warn":
    case 1: {
      return "warn";
    }

    case "error":
    case "deny":
    case 2: {
      return "error";
    }

    default: {
      throw new Error(`Unknown Oxlint rule severity: ${JSON.stringify(params.value)}`);
    }
  }
}

/**
 * Oxlint strips a leading `./` from a pattern, which anchors it to the root, and matches any other
 * pattern without a slash against any directory, as `**\/<pattern>`. Its `*` and `**` match dot
 * segments. Node's matcher skips them, so a segment's leading dot becomes a stand-in character in
 * both the path and the pattern, including after `{` or `,` in a brace set.
 */
function matchesOxlintGlob(params: { file: string; pattern: string }): boolean {
  const { file } = params;
  const anchored = params.pattern.startsWith("./");
  const pattern = anchored ? params.pattern.slice(2) : params.pattern;
  const normalized = anchored || pattern.includes("/") ? pattern : `**/${pattern}`;
  return path.posix.matchesGlob(
    file.replaceAll(/(^|\/)\./g, `$1${DOT_STAND_IN}`),
    normalized.replaceAll(/(^|[/{,])\./g, `$1${DOT_STAND_IN}`),
  );
}

/** Single-character classes escape glob metacharacters for both Oxlint and Node. */
function escapeGlob(file: string): string {
  return file.replaceAll(/[*?[\]{}]/g, (character) => `[${character}]`);
}
