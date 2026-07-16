import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { glob } from "glob";

import { compareViolations } from "./internal/violations";
import type {
  PlaywrightFlakeLinterConfig,
  PlaywrightFlakePatternViolation,
} from "./playwrightFlakeLinter";
import {
  findPlaywrightFlakePatternViolations,
  parsePlaywrightFlakeLinterConfig,
} from "./playwrightFlakeLinter";

const SOURCE_FILE_PATTERN = "*.{js,jsx,ts,tsx,mjs,cjs,mts,cts}";

interface LintPlaywrightProjectParams {
  config: PlaywrightFlakeLinterConfig;
  cwd: string;
}

interface LoadPlaywrightFlakeLinterConfigParams {
  configFilePath: string;
}

export async function lintPlaywrightProject({
  config,
  cwd,
}: LintPlaywrightProjectParams): Promise<PlaywrightFlakePatternViolation[]> {
  const filePaths = await findSourceFiles({ config, cwd });
  const nestedViolations = await Promise.all(
    filePaths.map(async (filePath) =>
      findPlaywrightFlakePatternViolations({
        config,
        filePath: path.relative(cwd, filePath),
        source: await readFile(filePath, "utf8"),
      }),
    ),
  );

  return nestedViolations.flat().toSorted(compareViolations);
}

export async function loadPlaywrightFlakeLinterConfig({
  configFilePath,
}: LoadPlaywrightFlakeLinterConfigParams): Promise<PlaywrightFlakeLinterConfig> {
  const importedModule: unknown = await import(
    `${pathToFileURL(path.resolve(configFilePath)).href}?loaded=${Date.now()}`
  );

  return parsePlaywrightFlakeLinterConfig({
    sourceDescription: configFilePath,
    value: getDefaultExport(importedModule),
  });
}

interface FindSourceFilesParams {
  config: PlaywrightFlakeLinterConfig;
  cwd: string;
}

async function findSourceFiles({ config, cwd }: FindSourceFilesParams): Promise<string[]> {
  const patterns = config.scanRoots.flatMap((scanRoot) => [
    normalizeGlobPath(scanRoot),
    path.posix.join(normalizeGlobPath(scanRoot), "**", SOURCE_FILE_PATTERN),
  ]);
  const filePaths = await glob(patterns, {
    absolute: true,
    cwd,
    nodir: true,
  });

  return filePaths.filter(isSourceFile);
}

function normalizeGlobPath(filePath: string): string {
  return filePath.replaceAll(path.sep, "/");
}

function isSourceFile(filePath: string): boolean {
  return /\.[cm]?[jt]sx?$/.test(filePath);
}

function getDefaultExport(importedModule: unknown): unknown {
  if (
    typeof importedModule !== "object" ||
    importedModule === null ||
    Array.isArray(importedModule)
  ) {
    return undefined;
  }

  return Reflect.get(importedModule, "default");
}
