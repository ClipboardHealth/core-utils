import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { isExpired, parseExceptions, type RemovalException } from "./internal/exceptions";
import { findReaders as findReadersInSource, type Reader } from "./internal/readers";
import { collectTemplateNames } from "./internal/templateNames";

export interface CheckRemovedEnvVarsParams {
  /** Repository root. */
  cwd: string;
  /** Git revision the pull request merges into, such as the pull request's base SHA. */
  baseRef: string;
  /** Directories of ECS container-definition JSON templates, relative to `cwd`. */
  templateDirectories: readonly string[];
  /** Exceptions file, relative to `cwd`. A missing file means no exceptions. */
  exceptionsPath: string;
  /** Package scopes whose installed code is searched, such as `@clipboard-health`. */
  packageScopes: readonly string[];
  /** Today's date as `YYYY-MM-DD`, for exception expiry. */
  today: string;
}

export interface RemovedVariable {
  name: string;
  /** Base-branch templates that set the variable. */
  templates: string[];
  readers: Reader[];
  exception?: RemovalException;
}

export interface CheckRemovedEnvVarsResult {
  /** Variables the templates no longer set. */
  removed: RemovedVariable[];
  /** Removed variables that code still reads, without a valid exception. */
  violations: RemovedVariable[];
  /** Problems that fail the check on their own, such as an unparsable template. */
  errors: string[];
  /** Exceptions that matched no removed variable; they can be deleted. */
  unusedExceptions: RemovalException[];
}

const CODE_PATHSPECS = [
  "*.ts",
  "*.tsx",
  "*.mts",
  "*.cts",
  "*.js",
  "*.jsx",
  "*.mjs",
  "*.cjs",
  // Tests don't run in the deployed service.
  ":(exclude)*.spec.*",
  ":(exclude)*.test.*",
];
const PACKAGE_CODE_PATTERN = /\.[cm]?js$/;

/**
 * Fails a change that stops setting an environment variable in its ECS task-definition templates
 * while code, the repository's or an installed internal package's, still reads it.
 */
export function checkRemovedEnvVars(params: CheckRemovedEnvVarsParams): CheckRemovedEnvVarsResult {
  const { cwd, baseRef, templateDirectories, exceptionsPath, packageScopes, today } = params;
  const errors: string[] = [];

  const baseCommit = resolveBaseCommit({ baseRef, cwd });
  const base = readTemplateNames({
    errors,
    files: listBaseTemplates({ baseCommit, cwd, templateDirectories }),
    read: (file) => git(cwd, ["show", `${baseCommit}:${file}`]),
  });
  const head = readTemplateNames({
    errors,
    files: listHeadTemplates({ cwd, templateDirectories }),
    read: (file) => readFileSync(path.join(cwd, file), "utf8"),
  });

  const removedNames = new Set([...base.keys()].filter((name) => !head.has(name)));
  const readers =
    removedNames.size === 0 ? [] : findReaders({ cwd, names: removedNames, packageScopes });

  const parsed = readExceptions({ cwd, exceptionsPath });
  errors.push(...parsed.errors);
  const exceptionsByName = new Map(
    parsed.exceptions.map((exception) => [exception.name, exception]),
  );

  const removed = [...removedNames].toSorted().map<RemovedVariable>((name) => {
    const exception = exceptionsByName.get(name);
    return {
      name,
      templates: [...(base.get(name) ?? [])].toSorted(),
      readers: readers.filter((reader) => reader.name === name),
      ...(exception === undefined ? {} : { exception }),
    };
  });

  const violations: RemovedVariable[] = [];
  for (const variable of removed) {
    if (variable.readers.length === 0) {
      continue;
    }

    if (variable.exception === undefined) {
      violations.push(variable);
    } else if (isExpired({ expiresOn: variable.exception.expiresOn, today })) {
      errors.push(
        `${exceptionsPath}: the exception for ${variable.name} expired on ${variable.exception.expiresOn}`,
      );
      violations.push(variable);
    }
  }

  return {
    removed,
    violations,
    errors,
    unusedExceptions: parsed.exceptions.filter((exception) => !removedNames.has(exception.name)),
  };
}

function git(cwd: string, arguments_: readonly string[]): string {
  return execFileSync("git", arguments_, {
    cwd,
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
  });
}

/** `git grep` exits 1 when nothing matches. */
function gitGrepFiles(cwd: string, arguments_: readonly string[]): string[] {
  try {
    return splitNul(git(cwd, ["grep", "-l", "-z", "-I", ...arguments_]));
  } catch (error) {
    if (isExitCode(error, 1)) {
      return [];
    }

    throw error;
  }
}

function isExitCode(error: unknown, code: number): boolean {
  return typeof error === "object" && error !== null && "status" in error && error.status === code;
}

function splitNul(output: string): string[] {
  return output.split("\0").filter((entry) => entry !== "");
}

/**
 * Compares with the merge base, so a branch checked out at its own head isn't charged with
 * variables that the base branch added after it branched.
 */
function resolveBaseCommit(params: { baseRef: string; cwd: string }): string {
  const { baseRef, cwd } = params;
  try {
    return git(cwd, ["merge-base", baseRef, "HEAD"]).trim();
  } catch (error) {
    throw new Error(
      `Can't find the merge base of ${baseRef} and HEAD. Fetch the base revision and enough history before running the check.`,
      { cause: error },
    );
  }
}

function listBaseTemplates(params: {
  baseCommit: string;
  cwd: string;
  templateDirectories: readonly string[];
}): string[] {
  const { baseCommit, cwd, templateDirectories } = params;
  return splitNul(
    git(cwd, ["ls-tree", "-r", "-z", "--name-only", baseCommit, "--", ...templateDirectories]),
  ).filter((file) => file.endsWith(".json"));
}

function listHeadTemplates(params: {
  cwd: string;
  templateDirectories: readonly string[];
}): string[] {
  const { cwd, templateDirectories } = params;
  return splitNul(
    git(cwd, [
      "ls-files",
      "-z",
      "--cached",
      "--others",
      "--exclude-standard",
      "--",
      ...templateDirectories,
    ]),
  ).filter((file) => file.endsWith(".json") && existsSync(path.join(cwd, file)));
}

/** Maps each variable name to the template files that set it. */
function readTemplateNames(params: {
  errors: string[];
  files: readonly string[];
  read: (file: string) => string;
}): Map<string, Set<string>> {
  const { errors, files, read } = params;
  const filesByName = new Map<string, Set<string>>();
  for (const file of files) {
    let json: unknown;
    try {
      json = JSON.parse(read(file));
    } catch (error) {
      errors.push(`${file}: can't parse template: ${String(error)}`);
      continue;
    }

    for (const name of collectTemplateNames(json)) {
      const templates = filesByName.get(name) ?? new Set<string>();
      templates.add(file);
      filesByName.set(name, templates);
    }
  }

  return filesByName;
}

function findReaders(params: {
  cwd: string;
  names: ReadonlySet<string>;
  packageScopes: readonly string[];
}): Reader[] {
  const { cwd, names, packageScopes } = params;
  const nameArguments = [...names].flatMap((name) => ["-e", name]);
  const repositoryFiles = new Set([
    ...gitGrepFiles(cwd, ["-F", ...nameArguments, "--", ...CODE_PATHSPECS]),
    ...gitGrepFiles(cwd, ["-F", "-e", "defaultValue", "--", ...CODE_PATHSPECS]),
  ]);
  const devPackages = readDevPackages(cwd);
  const packageFiles = packageScopes.flatMap((scope) =>
    listPackageFiles({
      cwd,
      devPackages,
      directory: path.join("node_modules", scope),
      packageScopes,
    }),
  );

  return [...[...repositoryFiles].toSorted(), ...packageFiles].flatMap((filePath) => {
    const source = readFileSync(path.join(cwd, filePath), "utf8");
    return findReadersInSource({ filePath, names, source });
  });
}

/**
 * Lists package code files relative to `cwd`. Inside nested `node_modules` directories it descends
 * only into the configured scopes. It skips symbolic links, such as workspace packages, which git
 * already covers, and development-only packages, which the deployed service doesn't install.
 */
function listPackageFiles(params: {
  cwd: string;
  devPackages: ReadonlySet<string>;
  directory: string;
  packageScopes: readonly string[];
}): string[] {
  const { cwd, devPackages, directory, packageScopes } = params;
  const absoluteDirectory = path.join(cwd, directory);
  if (devPackages.has(directory) || !existsSync(absoluteDirectory)) {
    return [];
  }

  return readdirSync(absoluteDirectory, { withFileTypes: true })
    .toSorted((left, right) => left.name.localeCompare(right.name))
    .flatMap((entry) => {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory() && entry.name === "node_modules") {
        return packageScopes.flatMap((scope) =>
          listPackageFiles({
            cwd,
            devPackages,
            directory: path.join(entryPath, scope),
            packageScopes,
          }),
        );
      }

      if (entry.isDirectory()) {
        return listPackageFiles({ cwd, devPackages, directory: entryPath, packageScopes });
      }

      return entry.isFile() && PACKAGE_CODE_PATTERN.test(entry.name) ? [entryPath] : [];
    });
}

/** Reads the install paths npm's lockfile marks as development-only. */
function readDevPackages(cwd: string): Set<string> {
  const lockfilePath = path.join(cwd, "package-lock.json");
  if (!existsSync(lockfilePath)) {
    return new Set();
  }

  const lockfile: unknown = JSON.parse(readFileSync(lockfilePath, "utf8"));
  const packages =
    typeof lockfile === "object" && lockfile !== null && "packages" in lockfile
      ? lockfile.packages
      : undefined;
  if (typeof packages !== "object" || packages === null) {
    return new Set();
  }

  return new Set(
    Object.entries(packages)
      .filter(
        ([, metadata]) =>
          typeof metadata === "object" &&
          metadata !== null &&
          "dev" in metadata &&
          metadata.dev === true,
      )
      .map(([installPath]) => installPath),
  );
}

function readExceptions(params: { cwd: string; exceptionsPath: string }) {
  const { cwd, exceptionsPath } = params;
  const absolutePath = path.join(cwd, exceptionsPath);
  if (!existsSync(absolutePath)) {
    return { exceptions: [], errors: [] };
  }

  return parseExceptions({ filePath: exceptionsPath, source: readFileSync(absolutePath, "utf8") });
}
