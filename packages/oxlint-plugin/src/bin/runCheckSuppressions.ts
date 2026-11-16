import { randomBytes } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { parseArgs } from "node:util";

import { git, readChangedLines, resolveMergeBase } from "../lib/internal/changedLines";
import { readIgnorePatterns, runOxlint } from "../lib/internal/runOxlint";
import { isPlainObject } from "../lib/internal/json";
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

  const recordDirectory = mkdtempSync(path.join(tmpdir(), "cbh-check-suppressions-"));
  const recordPath = path.join(recordDirectory, "violations.jsonl");
  // The configuration sits in the repository root so its `ignorePatterns` resolve as the
  // repository's own do; Oxlint applies only configuration patterns to explicit file arguments.
  const configPath = path.join(
    root,
    `.cbh-check-suppressions-${randomBytes(6).toString("hex")}.json`,
  );
  let records: string;
  try {
    withTemporaryFile({
      path: configPath,
      content: JSON.stringify({
        categories: Object.fromEntries(
          ["correctness", "nursery", "pedantic", "perf", "restriction", "style", "suspicious"].map(
            (category) => [category, "off"],
          ),
        ),
        ignorePatterns: readIgnorePatterns({ cwd: root }).ignorePatterns,
        jsPlugins: [{ name: "cbh-check-suppressions", specifier: pluginSpecifier }],
        plugins: [],
        rules: { [`cbh-check-suppressions/${SUPPRESSION_POLICY_RULE_NAME}`]: "error" },
        settings: { [RECORD_SETTING]: { recordPath } },
      }),
      run: () =>
        runOxlint({
          args: ["--config", configPath, "--disable-nested-config", "--format=json", ...files],
          cwd: root,
        }),
    });
    records = existsSync(recordPath) ? readFileSync(recordPath, "utf8") : "";
  } finally {
    rmSync(recordDirectory, { force: true, recursive: true });
  }

  const failures: string[] = [];
  for (const line of records.split("\n")) {
    if (line === "") {
      continue;
    }

    const { endLine, file: absoluteFile, message, startLine } = parseRecord({ line });
    const file = path.relative(root, absoluteFile);
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

/**
 * Writes `path`, runs `run`, and removes the file. While `run` blocks, Ctrl-C or SIGTERM still
 * stops Oxlint, which makes `run` throw; the listeners keep Node alive long enough to clean up.
 */
function withTemporaryFile<Result>(params: {
  content: string;
  path: string;
  run: () => Result;
}): Result {
  const keepAlive = (): void => {
    // Removing the listeners in `finally` restores the default exit-on-signal behavior.
  };

  process.on("SIGINT", keepAlive);
  process.on("SIGTERM", keepAlive);
  writeFileSync(params.path, params.content);
  try {
    return params.run();
  } finally {
    rmSync(params.path, { force: true });
    process.off("SIGINT", keepAlive);
    process.off("SIGTERM", keepAlive);
  }
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
