import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { parseArgs } from "node:util";

import { git, readChangedLines, resolveMergeBase } from "../lib/internal/changedLines";
import { type OxlintDiagnostic, readIgnorePatterns, runOxlint } from "../lib/internal/runOxlint";
import { isPlainObject } from "../lib/internal/json";
import { withTemporaryFile } from "../lib/internal/temporaryFile";
import { RECORD_SETTING, SUPPRESSION_POLICY_RULE_NAME } from "../lib/internal/suppressionPolicy";

const LINTABLE_FILE = /\.(?:[cm]?[jt]s|[jt]sx)$/;
const USAGE = `Usage: cbh-check-suppressions [--base <ref>]

Applies @clipboard-health/suppression-policy to lint directives added or changed since the merge
base with <ref>. Defaults to the pull request base in GitHub Actions, else origin/HEAD.
`;

export interface RunCheckSuppressionsParams {
  args: readonly string[];
  cwd: string;
  env: Readonly<Record<string, string | undefined>>;
  /** Module Oxlint loads the rule from; defaults to this package. */
  pluginSpecifier?: string;
  write: (output: string) => void;
}

export function runCheckSuppressions(params: RunCheckSuppressionsParams): { exitCode: number } {
  const { cwd, env, write } = params;
  const pluginSpecifier = params.pluginSpecifier ?? path.join(__dirname, "../index.js");

  let base: string | undefined;
  try {
    const { values } = parseArgs({
      args: [...params.args],
      options: { base: { type: "string" }, help: { type: "boolean", short: "h" } },
      strict: true,
    });
    if (values.help === true) {
      write(USAGE);
      return { exitCode: 0 };
    }

    ({ base } = values);
  } catch (error) {
    write(`${error instanceof Error ? error.message : String(error)}\n\n${USAGE}`);
    return { exitCode: 2 };
  }

  const root = git({ args: ["rev-parse", "--show-toplevel"], cwd }).trim();
  const mergeBase = resolveMergeBase({ base, cwd: root, eventPath: env["GITHUB_EVENT_PATH"] });
  const changed = readChangedLines({ cwd: root, include: LINTABLE_FILE, mergeBase });
  const files = [...changed.keys()];

  if (files.length === 0) {
    write("cbh-check-suppressions: no changed JavaScript or TypeScript files.\n");
    return { exitCode: 0 };
  }

  // Resolved, because Oxlint reports the real path of each file.
  const recordDirectory = mkdtempSync(path.join(realpathSync(tmpdir()), "cbh-check-suppressions-"));
  const recordPath = path.join(recordDirectory, "violations.jsonl");
  // Oxlint resolves a configuration's `ignorePatterns` against the configuration's own directory
  // and applies only configuration patterns to explicit file arguments. So the changed files are
  // copied to a scratch tree beside the configuration, outside the working tree, where tools that
  // scan the repository never see either.
  const scratchRoot = path.join(recordDirectory, "tree");
  const configPath = path.join(scratchRoot, ".oxlintrc.json");
  let records: string;
  let diagnostics: OxlintDiagnostic[];
  try {
    const { ignorePatterns } = readIgnorePatterns({ cwd: root });
    for (const file of files) {
      mkdirSync(path.dirname(path.join(scratchRoot, file)), { recursive: true });
      copyFileSync(path.join(root, file), path.join(scratchRoot, file));
    }

    ({ diagnostics } = withTemporaryFile({
      path: configPath,
      content: JSON.stringify({
        categories: Object.fromEntries(
          ["correctness", "nursery", "pedantic", "perf", "restriction", "style", "suspicious"].map(
            (category) => [category, "off"],
          ),
        ),
        ignorePatterns,
        jsPlugins: [{ name: "cbh-check-suppressions", specifier: pluginSpecifier }],
        plugins: [],
        rules: { [`cbh-check-suppressions/${SUPPRESSION_POLICY_RULE_NAME}`]: "error" },
        settings: { [RECORD_SETTING]: { recordPath } },
      }),
      run: () =>
        runOxlint({
          // Relative, because Oxlint matches override and ignore globs against the path as given.
          args: [
            "--config",
            path.basename(configPath),
            "--disable-nested-config",
            "--format=json",
            ...files,
          ],
          cwd: scratchRoot,
          oxlintFrom: root,
        }),
    }));
    records = existsSync(recordPath) ? readFileSync(recordPath, "utf8") : "";
  } finally {
    rmSync(recordDirectory, { force: true, recursive: true });
  }

  // Only the policy rule is enabled, so any other diagnostic, such as a parse error, means Oxlint
  // skipped the rule for that file and "no violations" would be false.
  const unevaluated = diagnostics
    .filter((diagnostic) => !diagnostic.code.endsWith(`(${SUPPRESSION_POLICY_RULE_NAME})`))
    .map(
      (diagnostic) =>
        `${path.relative(scratchRoot, path.resolve(scratchRoot, diagnostic.filename))}: ${diagnostic.message}`,
    );
  if (unevaluated.length > 0) {
    write(
      `${unevaluated.join("\n")}\n\ncbh-check-suppressions: Oxlint could not evaluate the policy for ${unevaluated.length} diagnostic(s); fix them and rerun.\n`,
    );
    return { exitCode: 1 };
  }

  const failures: string[] = [];
  for (const line of records.split("\n")) {
    if (line === "") {
      continue;
    }

    const { endLine, file: absoluteFile, message, startLine } = parseRecord({ line });
    const file = path.relative(scratchRoot, absoluteFile);
    const changedLines = changed.get(file);
    let touched = false;
    for (let lineNumber = startLine; lineNumber <= endLine && !touched; lineNumber += 1) {
      touched = changedLines?.has(lineNumber) ?? false;
    }

    if (touched) {
      failures.push(`${file}:${startLine}: ${message}`);
    }
  }

  failures.sort((left, right) => left.localeCompare(right, "en", { numeric: true }));
  if (failures.length > 0) {
    write(
      `${failures.join("\n")}\n\ncbh-check-suppressions: ${failures.length} new or changed suppression(s) break the suppression policy.\n`,
    );
    return { exitCode: 1 };
  }

  write(`cbh-check-suppressions: checked ${files.length} changed file(s); no violations.\n`);
  return { exitCode: 0 };
}

function parseRecord(params: { line: string }): {
  endLine: number;
  file: string;
  message: string;
  startLine: number;
} {
  const record: unknown = JSON.parse(params.line);
  if (
    !isPlainObject(record) ||
    typeof record["file"] !== "string" ||
    typeof record["message"] !== "string" ||
    typeof record["startLine"] !== "number" ||
    typeof record["endLine"] !== "number"
  ) {
    throw new TypeError(`Unexpected suppression-policy record: ${params.line}`);
  }

  return {
    endLine: record["endLine"],
    file: record["file"],
    message: record["message"],
    startLine: record["startLine"],
  };
}
