import {
  joinPathFragments,
  readJsonFile,
  workspaceRoot,
  writeJsonFile,
  type ExecutorContext,
} from "@nx/devkit";
import { copyAssets as nxCopyAssets, getUpdatedPackageJsonContent } from "@nx/js";
import { rmSync } from "node:fs";
import { isAbsolute } from "node:path";

type PackageJson = Parameters<typeof getUpdatedPackageJsonContent>[0];
type Asset = Parameters<typeof nxCopyAssets>[0]["assets"][number];

const EXTRA_ASSETS_BY_PROJECT_ROOT: Record<string, Asset[]> = {
  "packages/clearance": [
    {
      input: "./packages/clearance/safehouse",
      glob: "**/*",
      output: "./safehouse",
    },
    {
      input: "./packages/clearance/bin",
      glob: "**/*",
      output: "./bin",
    },
  ],
  "packages/embedex": ["packages/embedex/static/**/*"],
  "packages/nx-plugin": [
    {
      input: "./packages/nx-plugin/src",
      glob: "**/!(*.ts)",
      output: "./src",
    },
    {
      input: "./packages/nx-plugin/src",
      glob: "**/*.d.ts",
      output: "./src",
    },
    {
      input: "./packages/nx-plugin",
      glob: "generators.json",
      output: ".",
    },
  ],
  "packages/oxlint-config": [
    "packages/oxlint-config/src/base.json",
    "packages/oxlint-config/src/vitest.json",
  ],
  "packages/playwright-reporter-llm": ["packages/playwright-reporter-llm/docs/*.json"],
};

async function main(): Promise<void> {
  const [projectRootArgument, ...args] = process.argv.slice(2);
  const shouldClean = !args.includes("--no-clean");

  if (projectRootArgument === undefined) {
    throw new Error("Usage: tsx scripts/prepareTsgoPackage.mts <projectRoot> [--no-clean]");
  }

  const projectRoot = normalizeProjectRoot(projectRootArgument);
  const outputPath = joinPathFragments("dist", projectRoot);

  if (shouldClean) {
    cleanBuildOutput({ outputPath, projectRoot });
  }

  await copyAssets({ outputPath, projectRoot });
  await writePackageJson({ outputPath, projectRoot });
}

function normalizeProjectRoot(projectRoot: string): string {
  const segments = projectRoot.split("/").filter(Boolean);

  if (
    isAbsolute(projectRoot) ||
    projectRoot.includes("\\") ||
    segments.length === 0 ||
    segments.some((segment) => segment === "." || segment === "..")
  ) {
    throw new Error(`Invalid projectRoot: ${projectRoot}`);
  }

  const normalizedProjectRoot = joinPathFragments(...segments);

  if (!normalizedProjectRoot.startsWith("packages/")) {
    throw new Error(`Invalid projectRoot: ${projectRoot}`);
  }

  return normalizedProjectRoot;
}

function cleanBuildOutput({
  outputPath,
  projectRoot,
}: {
  outputPath: string;
  projectRoot: string;
}): void {
  rmSync(joinPathFragments(workspaceRoot, outputPath), { force: true, recursive: true });
  rmSync(
    joinPathFragments(workspaceRoot, ".nx", "tsbuildinfo", projectRoot, "tsconfig.lib.tsbuildinfo"),
    { force: true },
  );
}

async function copyAssets({
  outputPath,
  projectRoot,
}: {
  outputPath: string;
  projectRoot: string;
}): Promise<void> {
  const assets = [`${projectRoot}/*.md`, ...(EXTRA_ASSETS_BY_PROJECT_ROOT[projectRoot] ?? [])];

  const result = await nxCopyAssets(
    {
      assets,
      outputPath,
    },
    createExecutorContext(projectRoot),
  );

  if (!result.success) {
    throw new Error(`Failed to copy package assets for ${projectRoot}`);
  }
}

function createExecutorContext(projectRoot: string): ExecutorContext {
  const projectName = projectRoot.split("/").at(-1);

  if (projectName === undefined) {
    throw new Error(`Unable to derive project name from ${projectRoot}`);
  }

  return {
    cwd: workspaceRoot,
    isVerbose: false,
    nxJsonConfiguration: {},
    projectName,
    projectGraph: {
      dependencies: {},
      nodes: {},
    },
    projectsConfigurations: {
      projects: {
        [projectName]: {
          root: projectRoot,
        },
      },
      version: 2,
    },
    root: workspaceRoot,
  };
}

async function writePackageJson({
  outputPath,
  projectRoot,
}: {
  outputPath: string;
  projectRoot: string;
}): Promise<void> {
  const sourcePackageJsonPath = joinPathFragments(workspaceRoot, projectRoot, "package.json");
  const sourcePackageJson = readJsonFile<PackageJson>(sourcePackageJsonPath);
  const sourceMain = sourcePackageJson.main ?? "./src/index.js";
  const main = joinPathFragments(projectRoot, sourceMain);
  const packageJson = getUpdatedPackageJsonContent(sourcePackageJson, {
    format: sourcePackageJson.type === "module" ? ["esm"] : ["cjs"],
    main,
    outputPath,
    projectRoot,
    rootDir: projectRoot,
  });

  packageJson.types ??= packageJson.typings;
  removeSourceExportCondition(packageJson);

  const packageJsonPath = joinPathFragments(workspaceRoot, outputPath, "package.json");
  writeJsonFile(packageJsonPath, packageJson);
}

function removeSourceExportCondition(packageJson: PackageJson): void {
  stripSourceExportCondition(packageJson.exports);
}

function stripSourceExportCondition(value: unknown): void {
  if (!isRecord(value)) {
    return;
  }

  delete value["@clipboard-health/source"];

  for (const child of Object.values(value)) {
    stripSourceExportCondition(child);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
