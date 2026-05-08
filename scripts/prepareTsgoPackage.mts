import {
  joinPathFragments,
  readJsonFile,
  workspaceRoot,
  writeJsonFile,
  type ExecutorContext,
} from "@nx/devkit";
import { copyAssets as nxCopyAssets, getUpdatedPackageJsonContent } from "@nx/js";
import { rmSync } from "node:fs";

type PackageJson = Parameters<typeof getUpdatedPackageJsonContent>[0];
type Asset = Parameters<typeof nxCopyAssets>[0]["assets"][number];

const EXTRA_ASSETS_BY_PROJECT_ROOT: Record<string, Asset[]> = {
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
  const [projectRoot, ...args] = process.argv.slice(2);
  const shouldClean = !args.includes("--no-clean");

  if (projectRoot === undefined) {
    throw new Error("Usage: tsx scripts/prepareTsgoPackage.mts <projectRoot> [--no-clean]");
  }

  const outputPath = joinPathFragments("dist", projectRoot);

  if (shouldClean) {
    cleanBuildOutput({ outputPath, projectRoot });
  }

  await copyAssets({ outputPath, projectRoot });
  await writePackageJson({ outputPath, projectRoot });
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
    format: ["cjs"],
    main,
    outputPath,
    projectRoot,
    rootDir: projectRoot,
  });

  packageJson.types ??= packageJson.typings;

  const packageJsonPath = joinPathFragments(workspaceRoot, outputPath, "package.json");
  writeJsonFile(packageJsonPath, packageJson);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
