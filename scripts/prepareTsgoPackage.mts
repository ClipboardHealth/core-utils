import { readJsonFile, workspaceRoot, writeJsonFile } from "@nx/devkit";
import { CopyAssetsHandler } from "@nx/js/src/utils/assets/copy-assets-handler";
import { getUpdatedPackageJsonContent } from "@nx/js/src/utils/package-json/update-package-json";
import { rmSync } from "node:fs";
import { join } from "node:path";
import type { AssetGlob } from "@nx/js/src/utils/assets/assets";

const EXTRA_ASSETS_BY_PROJECT_ROOT: Record<string, (string | AssetGlob)[]> = {
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

  const outputPath = join("dist", projectRoot);

  if (shouldClean) {
    rmSync(join(workspaceRoot, outputPath), { force: true, recursive: true });
  }

  await copyAssets({ outputPath, projectRoot });
  await writePackageJson({ outputPath, projectRoot });
}

async function copyAssets({
  outputPath,
  projectRoot,
}: {
  outputPath: string;
  projectRoot: string;
}): Promise<void> {
  const assets = [`${projectRoot}/*.md`, ...(EXTRA_ASSETS_BY_PROJECT_ROOT[projectRoot] ?? [])];

  const assetHandler = new CopyAssetsHandler({
    assets,
    outputDir: outputPath,
    projectDir: projectRoot,
    rootDir: workspaceRoot,
  });

  await assetHandler.processAllAssetsOnce();
}

async function writePackageJson({
  outputPath,
  projectRoot,
}: {
  outputPath: string;
  projectRoot: string;
}): Promise<void> {
  const sourcePackageJsonPath = join(workspaceRoot, projectRoot, "package.json");
  const packageJson = getUpdatedPackageJsonContent(readJsonFile(sourcePackageJsonPath), {
    format: ["cjs"],
    main: `${projectRoot}/src/index.js`,
    outputPath,
    projectRoot,
    rootDir: projectRoot,
  });

  packageJson.types ??= packageJson.typings;

  const packageJsonPath = join(workspaceRoot, outputPath, "package.json");
  writeJsonFile(packageJsonPath, packageJson);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
