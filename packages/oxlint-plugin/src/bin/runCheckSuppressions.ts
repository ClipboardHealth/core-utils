import { randomBytes } from "node:crypto";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";

import { git, readChangedLines, resolveMergeBase } from "../lib/internal/changedLines";
import { readIgnorePatterns, runOxlint } from "../lib/internal/runOxlint";
import { SUPPRESSION_POLICY_RULE_NAME } from "../lib/internal/suppressionPolicy";

const LINTABLE_FILE = /\.(?:[cm]?[jt]s|[jt]sx)$/;
const BLANKET_DISABLE_RULE = "no-abusive-eslint-disable";
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

  // A random plugin alias, so no directive in the code can name and disable the rule this run
  // uses. `no-abusive-eslint-disable` reports blanket disables, which would silence it too.
  const alias = `cbh-check-suppressions-${randomBytes(6).toString("hex")}`;
  const policyCode = `${alias}(${SUPPRESSION_POLICY_RULE_NAME})`;
  // The configuration sits in the repository root so its `ignorePatterns` resolve as the
  // repository's own do; Oxlint applies only configuration patterns to explicit file arguments.
  const configPath = path.join(root, `.${alias}.json`);
  const { diagnostics } = withTemporaryFile({
    path: configPath,
    content: JSON.stringify({
      categories: Object.fromEntries(
        ["correctness", "nursery", "pedantic", "perf", "restriction", "style", "suspicious"].map(
          (category) => [category, "off"],
        ),
      ),
      ignorePatterns: readIgnorePatterns({ cwd: root }).ignorePatterns,
      jsPlugins: [{ name: alias, specifier: pluginSpecifier }],
      plugins: ["unicorn"],
      rules: {
        [`${alias}/${SUPPRESSION_POLICY_RULE_NAME}`]: "error",
        [`unicorn/${BLANKET_DISABLE_RULE}`]: "error",
      },
    }),
    run: () =>
      runOxlint({
        args: ["--config", configPath, "--disable-nested-config", "--format=json", ...files],
        cwd: root,
      }),
  });

  const failures: string[] = [];
  const sources = new Map<string, Buffer>();
  for (const { code, filename, message, span } of diagnostics) {
    if ((code !== policyCode && code !== `unicorn(${BLANKET_DISABLE_RULE})`) || !span) {
      continue;
    }

    const file = path.relative(root, path.resolve(root, filename));
    const source = sources.get(file) ?? readFileSync(path.join(root, file));
    sources.set(file, source);
    // Oxlint's offsets count UTF-8 bytes, so slice the bytes rather than a decoded string.
    const spanText = source.subarray(span.offset, span.offset + span.length).toString("utf8");
    const lastLine = span.line + spanText.split("\n").length - 1;
    const changedLines = changed.get(file);
    let touched = false;
    for (let line = span.line; line <= lastLine && !touched; line += 1) {
      touched = changedLines?.has(line) ?? false;
    }

    if (touched) {
      failures.push(`${file}:${span.line}: ${message}`);
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
