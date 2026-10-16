import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { parseArgs } from "node:util";

import { createOxlintConfig } from "../createOxlintConfig";
import { changedCode, changedCodeTypeAware } from "../presets";
import {
  type ChangedDiagnostic,
  filterChangedDiagnostics,
  type OxlintDiagnostic,
  parseAddedLines,
} from "./changedLines";

export interface RunOxlintChangedRequest {
  arguments_: readonly string[];
  cwd: string;
  environment: NodeJS.ProcessEnv;
  /** Overrides where the Clipboard plugin loads from; defaults to the installed package. */
  pluginPath?: string;
  write: (output: string) => void;
}

const USAGE = `Usage: oxlint-changed (--base <ref> | --staged) [--type-aware [--tsconfig <path>]]
                      [--ignore-pattern <glob>]...

Runs the changedCode preset (plus changedCodeTypeAware with --type-aware) and reports only
diagnostics on lines added since <ref>, or on staged lines with --staged.`;

const LINTED_EXTENSIONS: ReadonlySet<string> = new Set([
  ".cjs",
  ".cts",
  ".js",
  ".jsx",
  ".mjs",
  ".mts",
  ".ts",
  ".tsx",
]);
const FILES_PER_OXLINT_RUN = 200;
const ALL_CATEGORIES_OFF = {
  correctness: "off",
  nursery: "off",
  pedantic: "off",
  perf: "off",
  restriction: "off",
  style: "off",
  suspicious: "off",
} as const;

/** Returns 0 when changed lines are clean, 1 when they have violations, and 2 on usage errors. */
export function runOxlintChanged(request: RunOxlintChangedRequest): number {
  const { arguments_, environment, write } = request;
  const { values } = parseArgs({
    args: [...arguments_],
    options: {
      base: { type: "string" },
      help: { type: "boolean" },
      "ignore-pattern": { type: "string", multiple: true },
      staged: { type: "boolean" },
      tsconfig: { type: "string" },
      "type-aware": { type: "boolean" },
    },
  });

  if (values.help === true || (values.base === undefined) === (values.staged !== true)) {
    write(`${USAGE}\n`);
    return values.help === true ? 0 : 2;
  }

  const root = git({ cwd: request.cwd, args: ["rev-parse", "--show-toplevel"] }).trim();
  const range = values.base === undefined ? ["--cached"] : [`${values.base}...HEAD`];
  const diff = git({
    cwd: root,
    args: [
      "diff",
      "--unified=0",
      "--no-color",
      "--no-ext-diff",
      // Pin prefixes so diff.mnemonicPrefix or diff.noprefix in user config can't hide files.
      "--src-prefix=a/",
      "--dst-prefix=b/",
      "--diff-filter=AMR",
      ...range,
    ],
  });
  // Filter ignores here rather than in the config: oxlint resolves config ignorePatterns relative
  // to the temporary config's directory, so they would never match repository paths.
  const ignorePatterns = values["ignore-pattern"] ?? [];
  const addedLines = new Map(
    [...parseAddedLines({ diff })].filter(
      ([filePath]) =>
        LINTED_EXTENSIONS.has(path.extname(filePath)) &&
        !ignorePatterns.some((pattern) => path.matchesGlob(filePath, pattern)),
    ),
  );

  if (addedLines.size === 0) {
    write("oxlint-changed: no changed JavaScript or TypeScript lines\n");
    return 0;
  }

  // Line numbers come from the index (--staged) or HEAD (--base), but oxlint reads the working
  // tree. Refuse to run when they differ rather than report against the wrong lines.
  const unsynced = git({
    cwd: root,
    args: [
      "diff",
      "--name-only",
      ...(values.base === undefined ? [] : ["HEAD"]),
      "--",
      ...addedLines.keys(),
    ],
  }).trim();
  if (unsynced !== "") {
    write(
      `oxlint-changed: these files have ${values.base === undefined ? "unstaged" : "uncommitted"} changes, so their lines can't be matched:\n${unsynced}\nStage or stash them (lint-staged stashes unstaged changes for you) and rerun.\n`,
    );
    return 2;
  }

  const diagnostics = lintFiles({
    files: [...addedLines.keys()],
    isTypeAware: values["type-aware"] === true,
    pluginPath:
      request.pluginPath ?? createRequire(__filename).resolve("@clipboard-health/oxlint-plugin"),
    root,
    tsconfig: values.tsconfig,
  });
  const changed = filterChangedDiagnostics({
    addedLines,
    diagnostics,
    readFile: (filePath) => readFileSync(path.join(root, filePath)),
  });

  write(
    formatDiagnostics({
      diagnostics: changed,
      isGitHubActions: environment["GITHUB_ACTIONS"] === "true",
    }),
  );
  return changed.length > 0 ? 1 : 0;
}

function lintFiles(params: {
  files: readonly string[];
  isTypeAware: boolean;
  pluginPath: string;
  root: string;
  tsconfig: string | undefined;
}): OxlintDiagnostic[] {
  const { files, isTypeAware, pluginPath, root, tsconfig } = params;
  const directory = mkdtempSync(path.join(tmpdir(), "oxlint-changed-"));
  const configPath = path.join(directory, ".oxlintrc.json");
  const oxlintCli = resolveOxlintCli({ root });

  try {
    writeFileSync(configPath, JSON.stringify(buildConfig({ isTypeAware, pluginPath })));
    const typeAwareArguments = isTypeAware
      ? ["--type-aware", ...(tsconfig === undefined ? [] : ["--tsconfig", tsconfig])]
      : [];
    const diagnostics: OxlintDiagnostic[] = [];

    for (let index = 0; index < files.length; index += FILES_PER_OXLINT_RUN) {
      const chunk = files.slice(index, index + FILES_PER_OXLINT_RUN);
      const result = spawnSync(
        process.execPath,
        [
          oxlintCli,
          "-c",
          configPath,
          "--disable-nested-config",
          ...typeAwareArguments,
          "-f",
          "json",
          ...chunk,
        ],
        { cwd: root, encoding: "utf8", maxBuffer: 256 * 1024 * 1024 },
      );
      if (result.error) {
        throw result.error;
      }

      // oxlint exits non-zero when it reports diagnostics; only unparsable output is a failure.
      diagnostics.push(...parseOxlintOutput({ stderr: result.stderr, stdout: result.stdout }));
    }

    return diagnostics;
  } finally {
    rmSync(directory, { force: true, recursive: true });
  }
}

function buildConfig(params: { isTypeAware: boolean; pluginPath: string }): object {
  const { pluginPath } = params;

  return createOxlintConfig({
    presets: [
      {
        ...changedCode,
        // The temporary config lives outside the repository, so resolve the plugin from here.
        jsPlugins: (changedCode.jsPlugins ?? []).map((plugin) =>
          typeof plugin === "object" && plugin.specifier === "@clipboard-health/oxlint-plugin"
            ? { ...plugin, specifier: pluginPath }
            : plugin,
        ),
      },
      ...(params.isTypeAware ? [changedCodeTypeAware] : []),
    ],
    localConfig: { categories: ALL_CATEGORIES_OFF },
  });
}

function resolveOxlintCli(params: { root: string }): string {
  const fromRepository = createRequire(path.join(params.root, "package.json"));
  return path.join(path.dirname(fromRepository.resolve("oxlint/package.json")), "bin/oxlint");
}

function parseOxlintOutput(params: { stderr: string; stdout: string }): OxlintDiagnostic[] {
  const { stderr, stdout } = params;
  try {
    const parsed: unknown = JSON.parse(stdout);
    if (typeof parsed === "object" && parsed !== null && "diagnostics" in parsed) {
      // oxlint's JSON formatter owns this shape; the fields read here are stable across 1.x.
      return (parsed as { diagnostics: OxlintDiagnostic[] }).diagnostics;
    }
  } catch {
    // Fall through to the error below with oxlint's own output.
  }

  throw new Error(`oxlint did not return JSON diagnostics:\n${stderr || stdout}`);
}

function git(params: { args: readonly string[]; cwd: string }): string {
  return execFileSync("git", ["-c", "core.quotePath=false", ...params.args], {
    cwd: params.cwd,
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024,
  });
}

function formatDiagnostics(params: {
  diagnostics: readonly ChangedDiagnostic[];
  isGitHubActions: boolean;
}): string {
  const { diagnostics, isGitHubActions } = params;
  if (diagnostics.length === 0) {
    return "oxlint-changed: changed lines are clean\n";
  }

  const lines = diagnostics.map((diagnostic) => {
    const location = `${diagnostic.filename}:${diagnostic.line}:${diagnostic.column}`;
    return isGitHubActions
      ? `::error file=${diagnostic.filename},line=${diagnostic.line},col=${diagnostic.column},title=${diagnostic.code}::${diagnostic.message}`
      : `${location}  ${diagnostic.code}  ${diagnostic.message}`;
  });

  return `${lines.join("\n")}\n\noxlint-changed: ${diagnostics.length} violation(s) on changed lines\n`;
}
