import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

import { git, readChangedLines, resolveMergeBase } from "../lib/internal/changedLines";
import { readIgnorePatterns, runOxlint } from "../lib/internal/runOxlint";
import { SUPPRESSION_POLICY_RULE_NAME } from "../lib/internal/suppressionPolicy";

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
  const { args, cwd, env, write } = params;
  const pluginSpecifier = params.pluginSpecifier ?? path.join(__dirname, "../index.js");

  if (args.includes("--help") || args.includes("-h")) {
    write(USAGE);
    return { exitCode: 0 };
  }

  const baseIndex = args.indexOf("--base");
  const base = baseIndex === -1 ? undefined : args[baseIndex + 1];
  if (baseIndex !== -1 && base === undefined) {
    write(USAGE);
    return { exitCode: 2 };
  }

  const root = git({ args: ["rev-parse", "--show-toplevel"], cwd }).trim();
  const mergeBase = resolveMergeBase({ base, cwd: root, eventPath: env["GITHUB_EVENT_PATH"] });
  const changed = readChangedLines({ cwd: root, mergeBase });
  const files = [...changed.keys()].filter(
    (file) => LINTABLE_FILE.test(file) && existsSync(path.join(root, file)),
  );

  if (files.length === 0) {
    write("cbh-check-suppressions: no changed JavaScript or TypeScript files.\n");
    return { exitCode: 0 };
  }

  // A random plugin alias, so no directive in the code can name and disable the rule this run uses.
  const alias = `cbh-check-suppressions-${randomBytes(6).toString("hex")}`;
  const configPath = path.join(root, `.${alias}.json`);
  writeFileSync(
    configPath,
    JSON.stringify({
      categories: Object.fromEntries(
        ["correctness", "nursery", "pedantic", "perf", "restriction", "style", "suspicious"].map(
          (category) => [category, "off"],
        ),
      ),
      ignorePatterns: readIgnorePatterns({ cwd: root }).ignorePatterns,
      jsPlugins: [{ name: alias, specifier: pluginSpecifier }],
      plugins: [],
      rules: { [`${alias}/${SUPPRESSION_POLICY_RULE_NAME}`]: "error" },
    }),
  );

  let diagnostics;
  try {
    ({ diagnostics } = runOxlint({
      args: ["--config", configPath, "--disable-nested-config", "--format=json", ...files],
      cwd: root,
    }));
  } finally {
    rmSync(configPath, { force: true });
  }

  const failures: string[] = [];
  const sources = new Map<string, string>();
  for (const diagnostic of diagnostics) {
    const span = diagnostic.labels?.[0]?.span;
    if (diagnostic.code !== `${alias}(${SUPPRESSION_POLICY_RULE_NAME})` || span === undefined) {
      continue;
    }

    const file = path.relative(root, path.resolve(root, diagnostic.filename));
    const source = sources.get(file) ?? readFileSync(path.join(root, file), "utf8");
    sources.set(file, source);
    const lastLine =
      span.line + countNewlines(source.slice(span.offset, span.offset + span.length));
    const changedLines = changed.get(file);
    let touched = false;
    for (let line = span.line; line <= lastLine && !touched; line += 1) {
      touched = changedLines?.has(line) ?? false;
    }

    if (touched) {
      failures.push(`${file}:${span.line}: ${diagnostic.message}`);
    }
  }

  if (failures.length > 0) {
    write(
      `${failures.join("\n")}\n\ncbh-check-suppressions: ${failures.length} new or changed suppression(s) break the suppression policy.\n`,
    );
    return { exitCode: 1 };
  }

  write(`cbh-check-suppressions: checked ${files.length} changed file(s); no violations.\n`);
  return { exitCode: 0 };
}

function countNewlines(text: string): number {
  return text.split("\n").length - 1;
}
