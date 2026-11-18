import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";

import { isPlainObject } from "./json";

export interface OxlintDiagnostic {
  code: string;
  filename: string;
  message: string;
  /** Location of the first label; `offset` and `length` count UTF-8 bytes. */
  span: { length: number; line: number; offset: number } | undefined;
}

/**
 * Runs the repository's own Oxlint, so its version and configuration discovery apply. Oxlint
 * resolves from `oxlintFrom`, which defaults to `cwd`.
 */
export function runOxlint(params: { args: readonly string[]; cwd: string; oxlintFrom?: string }): {
  diagnostics: OxlintDiagnostic[];
} {
  const { args, cwd, oxlintFrom = cwd } = params;
  const result = spawnSync(process.execPath, [resolveOxlintBin({ cwd: oxlintFrom }), ...args], {
    cwd,
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024,
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0 && result.status !== 1) {
    throw new Error(
      `oxlint exited with status ${String(result.status)}.\n${result.stderr}${result.stdout}`,
    );
  }

  // Oxlint prefixes its JSON with this notice when every explicit path is ignored.
  const noFilesNotice = "No files found to lint. Please check your paths and ignore patterns.\n";
  const hasNoFilesNotice = result.stdout.startsWith(noFilesNotice);
  const report: unknown = JSON.parse(
    hasNoFilesNotice ? result.stdout.slice(noFilesNotice.length) : result.stdout,
  );
  if (!isPlainObject(report) || !Array.isArray(report["diagnostics"])) {
    throw new TypeError(`oxlint returned an unexpected JSON report.\n${result.stdout}`);
  }

  if (hasNoFilesNotice && (report["number_of_files"] !== 0 || report["diagnostics"].length > 0)) {
    throw new TypeError(`oxlint returned an inconsistent no-files report.\n${result.stdout}`);
  }

  return { diagnostics: report["diagnostics"].map((value) => toDiagnostic({ value })) };
}

/** Runs `oxlint --print-config` in the repository and returns its resolved `ignorePatterns`. */
export function readIgnorePatterns(params: { cwd: string }): { ignorePatterns: string[] } {
  return { ignorePatterns: toIgnorePatterns({ config: printOxlintConfig(params) }) };
}

/**
 * Runs `oxlint --print-config` in the repository: the configuration after categories expand into
 * rules and override globs are normalized. `env` replaces the environment the configuration sees.
 */
export function printOxlintConfig(params: {
  cwd: string;
  env?: NodeJS.ProcessEnv;
}): Record<string, unknown> {
  const { cwd, env } = params;
  const result = spawnSync(process.execPath, [resolveOxlintBin({ cwd }), "--print-config"], {
    cwd,
    encoding: "utf8",
    env,
    maxBuffer: 64 * 1024 * 1024,
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(`oxlint --print-config failed.\n${result.stderr}${result.stdout}`);
  }

  const config: unknown = JSON.parse(result.stdout);
  if (!isPlainObject(config)) {
    throw new TypeError(`oxlint --print-config returned an unexpected value.\n${result.stdout}`);
  }

  return config;
}

export function toIgnorePatterns(params: { config: Record<string, unknown> }): string[] {
  const patterns = params.config["ignorePatterns"];
  return Array.isArray(patterns)
    ? patterns.filter((pattern): pattern is string => typeof pattern === "string")
    : [];
}

function resolveOxlintBin(params: { cwd: string }): string {
  const requireFromCwd = createRequire(path.join(params.cwd, "package.json"));
  let packageJson: string;
  try {
    packageJson = requireFromCwd.resolve("oxlint/package.json");
  } catch (error) {
    throw new Error(
      `Cannot resolve oxlint from ${params.cwd}; install it, as @clipboard-health/oxlint-config requires.`,
      { cause: error },
    );
  }

  return path.join(path.dirname(packageJson), "bin/oxlint");
}

function toDiagnostic(params: { value: unknown }): OxlintDiagnostic {
  const { value } = params;
  if (
    !isPlainObject(value) ||
    typeof value["filename"] !== "string" ||
    typeof value["message"] !== "string"
  ) {
    throw new TypeError(`oxlint returned an unexpected diagnostic: ${JSON.stringify(value)}`);
  }

  const labels = value["labels"];
  const label: unknown = Array.isArray(labels) ? labels[0] : undefined;
  const span = isPlainObject(label) ? label["span"] : undefined;
  return {
    code: typeof value["code"] === "string" ? value["code"] : "",
    filename: value["filename"],
    message: value["message"],
    span:
      isPlainObject(span) &&
      typeof span["line"] === "number" &&
      typeof span["offset"] === "number" &&
      typeof span["length"] === "number"
        ? { length: span["length"], line: span["line"], offset: span["offset"] }
        : undefined,
  };
}
