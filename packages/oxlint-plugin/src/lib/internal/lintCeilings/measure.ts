import { randomBytes } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { isPlainObject } from "../json";
import { type OxlintDiagnostic, runOxlint, toIgnorePatterns } from "../runOxlint";
import { withTemporaryFile } from "../temporaryFile";
import { CEILING_RULES, getCeilingRule } from "./ceilingRules";

/**
 * A file's measured value for a rule it exceeds by default. `max` is the file's count, or its
 * largest per-function count; `excess` is the sum of each per-function count above the default.
 * For per-file rules, `excess` equals `max`.
 */
export interface Measured {
  excess: number;
  max: number;
}

/** Measured values by file, then rule. A missing entry means the file is within the default. */
export type Measurements = Map<string, Map<string, Measured>>;

const CATEGORIES = [
  "correctness",
  "nursery",
  "pedantic",
  "perf",
  "restriction",
  "style",
  "suspicious",
];
const VALUE = /\((\d+)\)|complexity of (\d+)/;
const LIMIT = /Maximum allowed is (\d+)/;

/**
 * Lints `files` at their paths under a scratch directory with only `ruleNames` enabled, configured
 * exactly as `printedConfig` (from `oxlint --print-config`, without ceilings) configures them. The
 * measurement is therefore Oxlint's own, against each file's default.
 */
export function measureFiles(params: {
  files: ReadonlyArray<{ content: string; path: string }>;
  oxlintFrom: string;
  printedConfig: Record<string, unknown>;
  ruleNames: readonly string[];
}): Measurements {
  const { files, oxlintFrom, printedConfig, ruleNames } = params;
  if (files.length === 0) {
    return new Map();
  }

  const directory = mkdtempSync(path.join(tmpdir(), "cb-lint-ceilings-"));
  try {
    for (const file of files) {
      const target = path.join(directory, file.path);
      mkdirSync(path.dirname(target), { recursive: true });
      writeFileSync(target, file.content);
    }

    const configPath = path.join(directory, ".cb-lint-ceilings.json");
    writeFileSync(
      configPath,
      JSON.stringify(measurementConfig({ ignorePatterns: [], printedConfig, ruleNames })),
    );
    const { diagnostics } = runOxlint({
      args: [
        // Relative, because Oxlint resolves override globs against the config path as given, and an
        // absolute path through a symlink, such as macOS's /var, matches no file.
        "--config",
        path.basename(configPath),
        "--disable-nested-config",
        "--format=json",
        ...files.map((file) => file.path),
      ],
      cwd: directory,
      oxlintFrom,
    });
    return toMeasurements({ cwd: directory, diagnostics });
  } finally {
    rmSync(directory, { force: true, recursive: true });
  }
}

/** Lints the whole repository, honoring its `ignorePatterns`, and measures `ruleNames`. */
export function measureRepository(params: {
  printedConfig: Record<string, unknown>;
  root: string;
  ruleNames: readonly string[];
}): Measurements {
  const { printedConfig, root, ruleNames } = params;
  // The configuration sits in the repository root so its `ignorePatterns` and override globs
  // resolve as the repository's own do.
  const configPath = path.join(root, `.cb-lint-ceilings-${randomBytes(6).toString("hex")}.json`);
  const { diagnostics } = withTemporaryFile({
    content: JSON.stringify(
      measurementConfig({
        ignorePatterns: toIgnorePatterns({ config: printedConfig }),
        printedConfig,
        ruleNames,
      }),
    ),
    path: configPath,
    run: () =>
      runOxlint({
        args: ["--config", path.basename(configPath), "--disable-nested-config", "--format=json"],
        cwd: root,
      }),
  });
  return toMeasurements({ cwd: root, diagnostics });
}

function measurementConfig(params: {
  ignorePatterns: readonly string[];
  printedConfig: Record<string, unknown>;
  ruleNames: readonly string[];
}): Record<string, unknown> {
  const { ignorePatterns, printedConfig, ruleNames } = params;
  const plugins = printedConfig["plugins"];
  const overrides = Array.isArray(printedConfig["overrides"]) ? printedConfig["overrides"] : [];
  return {
    categories: Object.fromEntries(CATEGORIES.map((category) => [category, "off"])),
    ignorePatterns,
    plugins: Array.isArray(plugins) ? plugins : [],
    rules: pickRules({ ruleNames, rules: printedConfig["rules"] }),
    overrides: overrides.flatMap((override: unknown) => {
      if (!isPlainObject(override) || !Array.isArray(override["files"])) {
        return [];
      }

      const rules = pickRules({ ruleNames, rules: override["rules"] });
      return Object.keys(rules).length === 0 ? [] : [{ files: override["files"], rules }];
    }),
  };
}

/** Keeps `ruleNames`, converting printed `["deny", [options]]` back to `["error", options]`. */
function pickRules(params: {
  ruleNames: readonly string[];
  rules: unknown;
}): Record<string, unknown> {
  const { ruleNames, rules } = params;
  if (!isPlainObject(rules)) {
    return {};
  }

  const picked: Record<string, unknown> = {};
  for (const ruleName of ruleNames) {
    const value = rules[ruleName];
    if (value !== undefined) {
      const [severity, options]: unknown[] = Array.isArray(value) ? value : [value];
      const inputSeverity = severity === "deny" ? "error" : severity === "allow" ? "off" : severity;
      picked[ruleName] = Array.isArray(options) ? [inputSeverity, ...options] : inputSeverity;
    }
  }

  return picked;
}

function toMeasurements(params: {
  cwd: string;
  diagnostics: readonly OxlintDiagnostic[];
}): Measurements {
  const { cwd, diagnostics } = params;
  const ruleByCode = new Map(
    Object.entries(CEILING_RULES).map(([name, rule]) => [rule.code, name]),
  );
  const measurements: Measurements = new Map();
  const unmeasured: string[] = [];

  for (const diagnostic of diagnostics) {
    const file = path
      .relative(cwd, path.resolve(cwd, diagnostic.filename))
      .split(path.sep)
      .join("/");
    const ruleName = ruleByCode.get(diagnostic.code);
    const valueMatch = VALUE.exec(diagnostic.message);
    if (ruleName === undefined || valueMatch === null) {
      unmeasured.push(`${file}: ${diagnostic.message}`);
      continue;
    }

    const value = Number(valueMatch[1] ?? valueMatch[2]);
    const fileMeasurements = measurements.get(file) ?? new Map<string, Measured>();
    measurements.set(file, fileMeasurements);
    const previous = fileMeasurements.get(ruleName);
    if (getCeilingRule(ruleName).scope === "file") {
      fileMeasurements.set(ruleName, { excess: value, max: value });
      continue;
    }

    const limitMatch = LIMIT.exec(diagnostic.message);
    if (limitMatch === null) {
      unmeasured.push(`${file}: ${diagnostic.message}`);
      continue;
    }

    const excess = value - Number(limitMatch[1]);
    fileMeasurements.set(ruleName, {
      excess: (previous?.excess ?? 0) + excess,
      max: Math.max(previous?.max ?? 0, value),
    });
  }

  // Only ceiling rules are enabled, so any other diagnostic, such as a parse error, means Oxlint
  // skipped the file and "within the default" would be false.
  if (unmeasured.length > 0) {
    throw new Error(
      `Oxlint could not measure ${unmeasured.length} diagnostic(s); fix them and rerun.\n${unmeasured.join("\n")}`,
    );
  }

  return measurements;
}
