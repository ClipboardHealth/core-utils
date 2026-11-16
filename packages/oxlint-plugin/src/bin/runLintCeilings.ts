import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";

import { git, resolveMergeBase } from "../lib/internal/changedLines";
import { isPlainObject } from "../lib/internal/json";
import { CEILING_RULES, isCeilingRule } from "../lib/internal/lintCeilings/ceilingRules";
import { LINT_CEILINGS_ENV } from "../lib/internal/lintCeilings/ceilingOverrides";
import {
  formatLintCeilings,
  LINT_CEILINGS_FILE,
  type LintCeilings,
  parseLintCeilings,
  readLintCeilingsText,
} from "../lib/internal/lintCeilings/ceilingsFile";
import {
  type ChangedFile,
  findIncreases,
  listedRules,
  tightenCeilings,
} from "../lib/internal/lintCeilings/compareCeilings";
import {
  type Measurements,
  measureFiles,
  measureRepository,
} from "../lib/internal/lintCeilings/measure";
import type { CliParams } from "../lib/internal/runCli";
import { printOxlintConfig } from "../lib/internal/runOxlint";

const USAGE = `Usage: cbh-lint-ceilings <command> [options]

Commands:
  check [--base <ref>] [--allow-increases]
      Fails if a changed file listed in ${LINT_CEILINGS_FILE} grew since the base, or if an entry
      was added or raised. --allow-increases reports these without failing; pass it only when the
      increase is approved. The base defaults to HEAD^1 for GitHub Actions merge commits and
      merge-queue runs, else the merge base with the pull request base or origin/HEAD.
  tighten
      Lowers each ceiling to its file's current value and removes entries for files that are
      missing or within the default.
  init [--rule <name>]...
      Writes an entry for every file that exceeds its default, for the given rules (default: all
      supported rules), keeping entries for other rules.
`;

interface Context {
  env: Readonly<Record<string, string | undefined>>;
  root: string;
  write: (output: string) => void;
}

export function runLintCeilings(params: CliParams): { exitCode: number } {
  const { cwd, env, write } = params;
  const [command, ...rest] = params.args;

  let values: { "allow-increases"?: boolean; base?: string; help?: boolean; rule?: string[] };
  try {
    ({ values } = parseArgs({
      args: rest,
      options: {
        "allow-increases": { type: "boolean" },
        base: { type: "string" },
        help: { type: "boolean", short: "h" },
        rule: { multiple: true, type: "string" },
      },
      strict: true,
    }));
    if (command === "--help" || command === "-h" || values.help === true) {
      write(USAGE);
      return { exitCode: 0 };
    }

    assertOptions({ command, values });
  } catch (error) {
    write(`${error instanceof Error ? error.message : String(error)}\n\n${USAGE}`);
    return { exitCode: 2 };
  }

  const root = git({ args: ["rev-parse", "--show-toplevel"], cwd }).trim();
  const context: Context = { env, root, write };
  switch (command) {
    case "check": {
      return check({
        allowIncreases: values["allow-increases"] === true,
        base: values.base,
        context,
      });
    }

    case "tighten": {
      return tighten({ context });
    }

    default: {
      return init({ context, ruleNames: values.rule ?? Object.keys(CEILING_RULES) });
    }
  }
}

function assertOptions(params: {
  command: string | undefined;
  values: { "allow-increases"?: boolean; base?: string; rule?: string[] };
}): void {
  const { command, values } = params;
  if (command !== "check" && command !== "tighten" && command !== "init") {
    throw new Error(`Unknown command: ${command ?? "(none)"}`);
  }

  if (command !== "check" && (values.base !== undefined || values["allow-increases"] === true)) {
    throw new Error("--base and --allow-increases apply only to check.");
  }

  if (command !== "init" && values.rule !== undefined) {
    throw new Error("--rule applies only to init.");
  }

  for (const rule of values.rule ?? []) {
    if (!isCeilingRule(rule)) {
      throw new Error(
        `Unsupported rule "${rule}". Use one of: ${Object.keys(CEILING_RULES).join(", ")}.`,
      );
    }
  }
}

function check(params: { allowIncreases: boolean; base: string | undefined; context: Context }): {
  exitCode: number;
} {
  const { allowIncreases, context } = params;
  const { env, root, write } = context;
  const ceilingsPath = path.join(root, LINT_CEILINGS_FILE);
  if (!existsSync(ceilingsPath)) {
    write(`cbh-lint-ceilings: no ${LINT_CEILINGS_FILE}; nothing to check.\n`);
    return { exitCode: 0 };
  }

  const { canonical, ceilings: headCeilings } = readLintCeilingsText({
    text: readFileSync(ceilingsPath, "utf8"),
  });
  if (!canonical) {
    write(
      `${LINT_CEILINGS_FILE} is not in the canonical layout: rules and paths sorted, a blank line between entries, and no empty rules. \`cbh-lint-ceilings tighten\` rewrites it in that layout.\n`,
    );
    return { exitCode: 1 };
  }

  const base = resolveBase({ base: params.base, env, root });
  const baseCeilings = readBaseCeilings({ base, root });
  const changedFiles = readChangedFiles({ base, root });
  const toMeasure = changedFiles.flatMap(({ basePath, headPath }) => {
    if (basePath === undefined || headPath === undefined) {
      return [];
    }

    const rules = listedRules({ baseCeilings, basePath, headCeilings, headPath });
    return rules.length === 0 ? [] : [{ basePath, headPath, rules }];
  });
  const ruleNames = [...new Set(toMeasure.flatMap((file) => file.rules))];

  let baseMeasurements: Measurements = new Map();
  let headMeasurements: Measurements = new Map();
  if (toMeasure.length > 0) {
    const printedConfig = printDefaults({ env, root });
    baseMeasurements = measureFiles({
      files: toMeasure.map((file) => ({
        content: git({ args: ["show", `${base}:${file.basePath}`], cwd: root }),
        path: file.basePath,
      })),
      oxlintFrom: root,
      printedConfig,
      ruleNames,
    });
    headMeasurements = measureFiles({
      files: toMeasure.map((file) => ({
        content: readFileSync(path.join(root, file.headPath), "utf8"),
        path: file.headPath,
      })),
      oxlintFrom: root,
      printedConfig,
      ruleNames,
    });
  }

  const increases = findIncreases({
    baseCeilings,
    baseMeasurements,
    changedFiles,
    headCeilings,
    headMeasurements,
  });
  const messages = increases.map((increase) => increase.message).join("\n");
  if (increases.length === 0) {
    write(`cbh-lint-ceilings: checked ${toMeasure.length} changed listed file(s); nothing grew.\n`);
    return { exitCode: 0 };
  }

  if (allowIncreases) {
    write(
      `${messages}\n\ncbh-lint-ceilings: ${increases.length} increase(s) allowed by --allow-increases.\n`,
    );
    return { exitCode: 0 };
  }

  write(
    `${messages}\n\ncbh-lint-ceilings: ${increases.length} increase(s). Files listed in ${LINT_CEILINGS_FILE} may shrink but not grow, and entries may be lowered or removed but not added or raised without approval. Oxlint enforces the ceiling, which can be up to a week stale; this check enforces no growth.\n`,
  );
  return { exitCode: 1 };
}

function tighten(params: { context: Context }): { exitCode: number } {
  const { env, root, write } = params.context;
  const ceilingsPath = path.join(root, LINT_CEILINGS_FILE);
  if (!existsSync(ceilingsPath)) {
    write(`cbh-lint-ceilings: no ${LINT_CEILINGS_FILE}; nothing to tighten.\n`);
    return { exitCode: 0 };
  }

  const { ceilings } = readLintCeilingsText({ text: readFileSync(ceilingsPath, "utf8") });
  const exists = (file: string): boolean => existsSync(path.join(root, file));
  const files = [
    ...new Set(Object.values(ceilings.rules).flatMap((entries) => Object.keys(entries))),
  ]
    .filter((file) => exists(file))
    .map((file) => ({ content: readFileSync(path.join(root, file), "utf8"), path: file }));
  const measurements = measureFiles({
    files,
    oxlintFrom: root,
    printedConfig: printDefaults({ env, root }),
    ruleNames: Object.keys(ceilings.rules),
  });
  const { ceilings: tightened, changes } = tightenCeilings({ ceilings, exists, measurements });
  writeFileSync(ceilingsPath, formatLintCeilings({ ceilings: tightened }));
  write(
    changes.length === 0
      ? "cbh-lint-ceilings: every ceiling is current.\n"
      : `${changes.join("\n")}\n\ncbh-lint-ceilings: tightened ${changes.length} entr${changes.length === 1 ? "y" : "ies"}.\n`,
  );
  return { exitCode: 0 };
}

function init(params: { context: Context; ruleNames: readonly string[] }): { exitCode: number } {
  const { context, ruleNames } = params;
  const { env, root, write } = context;
  const ceilingsPath = path.join(root, LINT_CEILINGS_FILE);
  const existing: LintCeilings = existsSync(ceilingsPath)
    ? readLintCeilingsText({ text: readFileSync(ceilingsPath, "utf8") }).ceilings
    : { rules: {}, version: 1 };
  const measurements = measureRepository({
    printedConfig: printDefaults({ env, root }),
    root,
    ruleNames,
  });

  const rules = { ...existing.rules };
  let count = 0;
  for (const ruleName of ruleNames) {
    const entries: Record<string, number> = {};
    for (const [file, fileMeasurements] of measurements) {
      const measured = fileMeasurements.get(ruleName);
      if (measured !== undefined) {
        entries[file] = measured.max;
        count += 1;
      }
    }

    rules[ruleName] = entries;
  }

  writeFileSync(ceilingsPath, formatLintCeilings({ ceilings: { rules, version: 1 } }));
  write(
    `cbh-lint-ceilings: wrote ${count} entr${count === 1 ? "y" : "ies"} to ${LINT_CEILINGS_FILE}.\n`,
  );
  return { exitCode: 0 };
}

/** The repository's resolved configuration with lint-ceilings.json ignored, so defaults show. */
function printDefaults(params: {
  env: Readonly<Record<string, string | undefined>>;
  root: string;
}): Record<string, unknown> {
  return printOxlintConfig({
    cwd: params.root,
    env: { ...params.env, [LINT_CEILINGS_ENV]: "ignore" },
  });
}

/**
 * In GitHub Actions, a `pull_request` run's default checkout is a merge commit whose first parent
 * is the target branch, so `fetch-depth: 2` is enough; a `merge_group` run compares with the
 * queue's base. Any other checkout, such as the pull request head, uses the merge base.
 */
function resolveBase(params: {
  base: string | undefined;
  env: Readonly<Record<string, string | undefined>>;
  root: string;
}): string {
  const { base, env, root } = params;
  const eventPath = env["GITHUB_EVENT_PATH"];
  if (base !== undefined || env["GITHUB_ACTIONS"] !== "true") {
    return resolveMergeBase({ base, cwd: root, eventPath });
  }

  if (env["GITHUB_EVENT_NAME"] === "merge_group") {
    const queueBase = readEventField({ eventPath, keys: ["merge_group", "base_sha"] });
    if (queueBase === undefined) {
      throw new Error("The merge_group event has no merge_group.base_sha.");
    }

    return requireCommit({ commit: queueBase, root });
  }

  const head = git({ args: ["rev-parse", "HEAD"], cwd: root }).trim();
  if (head === env["GITHUB_SHA"]) {
    const parents = git({ args: ["rev-list", "--parents", "-n", "1", "HEAD"], cwd: root })
      .trim()
      .split(" ")
      .slice(1);
    // A shallow clone's oldest commit shows no parents.
    if (parents.length === 0) {
      throw new Error(
        "HEAD has no parent commit in this checkout. In GitHub Actions, check out with `fetch-depth: 2`.",
      );
    }

    if (parents.length >= 2 && parents[0] !== undefined) {
      return requireCommit({ commit: parents[0], root });
    }
  }

  return resolveMergeBase({ base, cwd: root, eventPath });
}

function requireCommit(params: { commit: string; root: string }): string {
  try {
    git({ args: ["cat-file", "-e", `${params.commit}^{commit}`], cwd: params.root });
  } catch (error) {
    throw new Error(
      `Base commit ${params.commit} is not in this checkout. In GitHub Actions, check out with \`fetch-depth: 2\`, or deeper for a rebase merge queue.`,
      { cause: error },
    );
  }

  return params.commit;
}

function readEventField(params: {
  eventPath: string | undefined;
  keys: readonly string[];
}): string | undefined {
  const { eventPath, keys } = params;
  if (eventPath === undefined || eventPath === "") {
    return undefined;
  }

  let value: unknown = JSON.parse(readFileSync(eventPath, "utf8"));
  for (const key of keys) {
    value = isPlainObject(value) ? value[key] : undefined;
  }

  return typeof value === "string" ? value : undefined;
}

function readBaseCeilings(params: { base: string; root: string }): LintCeilings {
  const { base, root } = params;
  let text: string;
  try {
    text = git({ args: ["show", `${base}:${LINT_CEILINGS_FILE}`], cwd: root });
  } catch {
    return { rules: {}, version: 1 };
  }

  return parseLintCeilings({ value: JSON.parse(text) });
}

/** Files changed between `base` and the working tree, following renames. */
function readChangedFiles(params: { base: string; root: string }): ChangedFile[] {
  const fields = git({
    args: ["diff", "--name-status", "-z", "--find-renames", "--no-ext-diff", params.base],
    cwd: params.root,
  }).split("\0");
  const changed: ChangedFile[] = [];
  for (let index = 0; index < fields.length - 1;) {
    const status = fields[index] ?? "";
    if (status.startsWith("R") || status.startsWith("C")) {
      const from = fields[index + 1];
      const to = fields[index + 2];
      changed.push({ basePath: status.startsWith("R") ? from : undefined, headPath: to });
      index += 3;
    } else {
      const file = fields[index + 1];
      changed.push({
        basePath: status === "A" ? undefined : file,
        headPath: status === "D" ? undefined : file,
      });
      index += 2;
    }
  }

  return changed;
}
