import { isPlainObject } from "../json";
import { CEILING_RULES, isCeilingRule } from "./ceilingRules";

export const LINT_CEILINGS_FILE = "lint-ceilings.json";

/**
 * Per-file upper bounds, keyed by canonical Oxlint rule name, then path relative to the directory
 * that holds lint-ceilings.json.
 */
export interface LintCeilings {
  rules: Record<string, Record<string, number>>;
  version: 1;
}

/** Validates a parsed lint-ceilings.json and returns it; throws listing every problem. */
export function parseLintCeilings(params: { value: unknown }): LintCeilings {
  const { value } = params;
  const problems: string[] = [];
  const rules: LintCeilings["rules"] = {};

  if (!isPlainObject(value)) {
    throw new Error(`${LINT_CEILINGS_FILE} must be a JSON object.`);
  }

  if (value["version"] !== 1) {
    problems.push('"version" must be 1.');
  }

  for (const key of Object.keys(value)) {
    if (key !== "version" && key !== "rules") {
      problems.push(`Unknown top-level key "${key}".`);
    }
  }

  const rawRules = value["rules"];
  if (isPlainObject(rawRules)) {
    for (const [ruleName, entries] of Object.entries(rawRules)) {
      if (!isCeilingRule(ruleName)) {
        problems.push(
          `Unsupported rule "${ruleName}". Use one of: ${Object.keys(CEILING_RULES).join(", ")}.`,
        );
        continue;
      }

      if (!isPlainObject(entries)) {
        problems.push(`"rules.${ruleName}" must map file paths to numbers.`);
        continue;
      }

      const ruleEntries: Record<string, number> = {};
      for (const [file, ceiling] of Object.entries(entries)) {
        const pathProblem = checkPath({ file });
        if (pathProblem !== undefined) {
          problems.push(`"rules.${ruleName}" path "${file}" ${pathProblem}`);
        } else if (typeof ceiling !== "number" || !Number.isInteger(ceiling) || ceiling < 1) {
          problems.push(`"rules.${ruleName}.${file}" must be a positive integer.`);
        } else {
          ruleEntries[file] = ceiling;
        }
      }

      rules[ruleName] = ruleEntries;
    }
  } else {
    problems.push('"rules" must be an object.');
  }

  if (problems.length > 0) {
    throw new Error(`Invalid ${LINT_CEILINGS_FILE}:\n- ${problems.join("\n- ")}`);
  }

  return { rules, version: 1 };
}

/**
 * Formats ceilings in the canonical layout: rules and paths sorted, empty rules dropped, and a
 * blank line between entries so that edits to neighbouring entries don't form one diff hunk.
 */
export function formatLintCeilings(params: { ceilings: LintCeilings }): string {
  const ruleBlocks = Object.entries(params.ceilings.rules)
    .filter(([, entries]) => Object.keys(entries).length > 0)
    .toSorted(([left], [right]) => compareStrings(left, right))
    .map(([ruleName, entries]) => {
      const lines = Object.entries(entries)
        .toSorted(([left], [right]) => compareStrings(left, right))
        .map(([file, ceiling]) => `      ${JSON.stringify(file)}: ${ceiling}`);
      return `    ${JSON.stringify(ruleName)}: {\n${lines.join(",\n\n")}\n    }`;
    });

  const rules = ruleBlocks.length === 0 ? "{}" : `{\n${ruleBlocks.join(",\n\n")}\n  }`;
  return `{\n  "version": 1,\n  "rules": ${rules}\n}\n`;
}

/** Parses lint-ceilings.json text and reports whether it is in the canonical layout. */
export function readLintCeilingsText(params: { text: string }): {
  canonical: boolean;
  ceilings: LintCeilings;
} {
  let value: unknown;
  try {
    value = JSON.parse(params.text);
  } catch (error) {
    throw new Error(
      `${LINT_CEILINGS_FILE} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    );
  }

  const ceilings = parseLintCeilings({ value });
  return { canonical: formatLintCeilings({ ceilings }) === params.text, ceilings };
}

export function compareStrings(left: string, right: string): number {
  if (left === right) {
    return 0;
  }

  return left < right ? -1 : 1;
}

function checkPath(params: { file: string }): string | undefined {
  const { file } = params;
  if (file === "" || file.trim() !== file) {
    return "must be a non-empty path without surrounding whitespace.";
  }

  if (file.startsWith("/") || file.includes("\\")) {
    return "must be relative to the directory that holds lint-ceilings.json and use forward slashes.";
  }

  const segments = file.split("/");
  if (segments.some((segment) => segment === "" || segment === "." || segment === "..")) {
    return 'must be normalized: no "./", "../" or empty segments.';
  }

  return undefined;
}
