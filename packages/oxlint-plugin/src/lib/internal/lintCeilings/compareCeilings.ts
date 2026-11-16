import { getCeilingRule } from "./ceilingRules";
import { compareStrings, LINT_CEILINGS_FILE, type LintCeilings } from "./ceilingsFile";
import type { Measured, Measurements } from "./measure";

/** A file the branch changed, at its base path (absent if added) and head path (absent if deleted). */
export interface ChangedFile {
  basePath: string | undefined;
  headPath: string | undefined;
}

export interface Increase {
  file: string;
  message: string;
  rule: string;
}

/**
 * Finds what may not increase without approval: entries added or raised in lint-ceilings.json,
 * and listed files whose measured value grew. Lowered, removed, stale-high and within-default
 * entries all pass. An entry that follows its file's rename keeps the old entry's allowance.
 */
export function findIncreases(params: {
  baseCeilings: LintCeilings;
  baseMeasurements: Measurements;
  changedFiles: readonly ChangedFile[];
  headCeilings: LintCeilings;
  headMeasurements: Measurements;
}): Increase[] {
  const { baseCeilings, baseMeasurements, changedFiles, headCeilings, headMeasurements } = params;
  const increases: Increase[] = [];
  const basePathOf = new Map(
    changedFiles.flatMap((file) =>
      file.headPath === undefined ? [] : [[file.headPath, file.basePath] as const],
    ),
  );

  for (const [rule, entries] of Object.entries(headCeilings.rules)) {
    for (const [file, ceiling] of Object.entries(entries)) {
      const basePath = basePathOf.has(file) ? basePathOf.get(file) : file;
      const baseCeiling = basePath === undefined ? undefined : baseCeilings.rules[rule]?.[basePath];
      if (baseCeiling === undefined) {
        increases.push({
          file,
          message: `${file}: new ${rule} entry (${ceiling}) in ${LINT_CEILINGS_FILE}.`,
          rule,
        });
      } else if (ceiling > baseCeiling) {
        increases.push({
          file,
          message: `${file}: ${rule} ceiling raised from ${baseCeiling} to ${ceiling} in ${LINT_CEILINGS_FILE}.`,
          rule,
        });
      }
    }
  }

  for (const { basePath, headPath } of changedFiles) {
    if (basePath === undefined || headPath === undefined) {
      continue;
    }

    for (const rule of listedRules({ baseCeilings, basePath, headCeilings, headPath })) {
      const before = baseMeasurements.get(basePath)?.get(rule);
      const after = headMeasurements.get(headPath)?.get(rule);
      if (after !== undefined && grew({ after, before })) {
        increases.push({
          file: headPath,
          message: `${headPath} is listed in ${LINT_CEILINGS_FILE} for ${rule}: it may not grow (base: ${describe({ measured: before, rule })}; now: ${describe({ measured: after, rule })}). Shrink or split it.`,
          rule,
        });
      }
    }
  }

  return increases.toSorted(
    (left, right) => compareStrings(left.file, right.file) || compareStrings(left.rule, right.rule),
  );
}

/** Rules that list the file at either end of the branch, so measuring them can show growth. */
export function listedRules(params: {
  baseCeilings: LintCeilings;
  basePath: string;
  headCeilings: LintCeilings;
  headPath: string;
}): string[] {
  const { baseCeilings, basePath, headCeilings, headPath } = params;
  const rules = new Set<string>();
  for (const [rule, entries] of Object.entries(headCeilings.rules)) {
    if (Object.hasOwn(entries, headPath)) {
      rules.add(rule);
    }
  }

  for (const [rule, entries] of Object.entries(baseCeilings.rules)) {
    if (Object.hasOwn(entries, basePath)) {
      rules.add(rule);
    }
  }

  return [...rules].toSorted(compareStrings);
}

/**
 * Lowers each ceiling to its file's measured value and drops entries for missing files and files
 * within the default. Never raises.
 */
export function tightenCeilings(params: {
  ceilings: LintCeilings;
  exists: (file: string) => boolean;
  measurements: Measurements;
}): { ceilings: LintCeilings; changes: string[] } {
  const { ceilings, exists, measurements } = params;
  const changes: string[] = [];
  const rules: LintCeilings["rules"] = {};

  for (const [rule, entries] of Object.entries(ceilings.rules)) {
    const tightened: Record<string, number> = {};
    for (const [file, ceiling] of Object.entries(entries)) {
      const measured = exists(file) ? measurements.get(file)?.get(rule) : undefined;
      if (measured === undefined) {
        changes.push(
          `${rule} ${file}: removed (${exists(file) ? "within the default" : "file not found"}).`,
        );
      } else if (measured.max < ceiling) {
        tightened[file] = measured.max;
        changes.push(`${rule} ${file}: ${ceiling} -> ${measured.max}.`);
      } else {
        tightened[file] = ceiling;
      }
    }

    rules[rule] = tightened;
  }

  return { ceilings: { rules, version: 1 }, changes };
}

/** Grew: was within the default, or its largest value or total excess rose. */
function grew(params: { after: Measured; before: Measured | undefined }): boolean {
  const { after, before } = params;
  return before === undefined || after.max > before.max || after.excess > before.excess;
}

function describe(params: { measured: Measured | undefined; rule: string }): string {
  const { measured, rule } = params;
  if (measured === undefined) {
    return "within the default";
  }

  return getCeilingRule(rule).scope === "file"
    ? String(measured.max)
    : `max ${measured.max}, ${measured.excess} over the default in total`;
}
