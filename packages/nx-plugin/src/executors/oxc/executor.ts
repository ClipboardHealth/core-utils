/* eslint-disable security/detect-non-literal-fs-filename -- Build executor requires dynamic file paths */
import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

import type { ExecutorContext } from "@nx/devkit";
import { glob } from "glob";
import { transformSync } from "oxc-transform";

import type { OxcExecutorSchema } from "./schema";

interface TsConfig {
  compilerOptions?: {
    declaration?: boolean;
    emitDecoratorMetadata?: boolean;
    experimentalDecorators?: boolean;
    module?: string;
    outDir?: string;
    target?: string;
  };
  extends?: string | string[];
  include?: string[];
  exclude?: string[];
}

function readTsConfig(tsConfigPath: string): TsConfig {
  const content = readFileSync(tsConfigPath, "utf8");
  const cleanContent = content.replaceAll(/\/\*[\s\S]*?\*\/|\/\/.*/g, "");
  return JSON.parse(cleanContent) as TsConfig;
}

function resolveExtendedConfig(
  configDir: string,
  extendsPath: string,
  workspaceRoot: string,
): TsConfig {
  const isPackageReference = !extendsPath.startsWith(".");
  if (isPackageReference) {
    try {
       
      const packagePath = require.resolve(extendsPath, { paths: [workspaceRoot] });
      return resolveTsConfig(packagePath, workspaceRoot);
    } catch {
      return {};
    }
  }
  const baseConfigPath = path.resolve(configDir, extendsPath);
  return resolveTsConfig(baseConfigPath, workspaceRoot);
}

function resolveTsConfig(tsConfigPath: string, workspaceRoot: string): TsConfig {
  const tsConfig = readTsConfig(tsConfigPath);
  if (!tsConfig.extends) {
    return tsConfig;
  }

  const configDir = path.dirname(tsConfigPath);
  const extendsList = Array.isArray(tsConfig.extends) ? tsConfig.extends : [tsConfig.extends];

  let mergedConfig: TsConfig = {};
  for (const extendsPath of extendsList) {
    const baseConfig = resolveExtendedConfig(configDir, extendsPath, workspaceRoot);
    mergedConfig = {
      ...mergedConfig,
      ...baseConfig,
      compilerOptions: {
        ...mergedConfig.compilerOptions,
        ...baseConfig.compilerOptions,
      },
    };
  }

  return {
    ...mergedConfig,
    ...tsConfig,
    compilerOptions: {
      ...mergedConfig.compilerOptions,
      ...tsConfig.compilerOptions,
    },
  };
}

function ensureDirectory(directory: string): void {
  mkdirSync(directory, { recursive: true });
}

function copyAssets(
  assets: OxcExecutorSchema["assets"],
  outputPath: string,
  workspaceRoot: string,
): void {
  for (const asset of assets) {
    if (typeof asset === "string") {
      const files = glob.sync(asset, { cwd: workspaceRoot });
      for (const file of files) {
        const source = path.join(workspaceRoot, file);
        const destination = path.join(outputPath, path.basename(file));
        ensureDirectory(path.dirname(destination));
        copyFileSync(source, destination);
      }
    } else {
      const inputPath = path.join(workspaceRoot, asset.input);
      const files = glob.sync(asset.glob, { cwd: inputPath });
      for (const file of files) {
        const source = path.join(inputPath, file);
        const destination = path.join(outputPath, asset.output, file);
        ensureDirectory(path.dirname(destination));
        copyFileSync(source, destination);
      }
    }
  }
}

export default async function runExecutor(
  options: OxcExecutorSchema,
  context: ExecutorContext,
): Promise<{ success: boolean }> {
  const { root } = context;
  const outputPath = path.join(root, options.outputPath);
  const tsConfigPath = path.join(root, options.tsConfig);
  const projectRoot = path.dirname(options.tsConfig);
  const sourceRoot = path.join(projectRoot, "src");

  const tsConfig = resolveTsConfig(tsConfigPath, root);
  const hasDecoratorMetadata = tsConfig.compilerOptions?.emitDecoratorMetadata ?? false;
  const hasDecorators = tsConfig.compilerOptions?.experimentalDecorators ?? false;
  const generateDeclarations = tsConfig.compilerOptions?.declaration ?? false;

  rmSync(outputPath, { recursive: true, force: true });
  ensureDirectory(outputPath);

  const sourceDirectory = path.join(root, sourceRoot);
  const exclude = tsConfig.exclude ?? [];
  const excludePatterns = exclude.map((pattern) => `!${pattern}`);
  const files = glob.sync(["**/*.ts", "**/*.tsx", ...excludePatterns], {
    cwd: sourceDirectory,
    nodir: true,
  });

  let hasErrors = false;
  let declarationWarningShown = false;

  for (const file of files) {
    const sourcePath = path.join(sourceDirectory, file);
    const sourceText = readFileSync(sourcePath, "utf8");

    const outputFile = file.replace(/\.tsx?$/, ".js");
    const declarationFile = file.replace(/\.tsx?$/, ".d.ts");
    const outputFilePath = path.join(outputPath, "src", outputFile);
    const declarationFilePath = path.join(outputPath, "src", declarationFile);

    let result = transformSync(file, sourceText, {
      ...(generateDeclarations && { typescript: { declaration: {} } }),
      ...(hasDecorators && {
        decorator: {
          legacy: true,
          emitDecoratorMetadata: hasDecoratorMetadata,
        },
      }),
    });

    const hasIsolatedDeclarationsErrors =
      generateDeclarations &&
      result.errors.some((error) => error.message.includes("isolatedDeclarations"));

    if (hasIsolatedDeclarationsErrors) {
      if (!declarationWarningShown) {
        // eslint-disable-next-line no-console
        console.warn(
          "Warning: Code is not compatible with --isolatedDeclarations. " +
            "Skipping declaration generation. Use tsc for declarations.",
        );
        declarationWarningShown = true;
      }
      result = transformSync(file, sourceText, {
        ...(hasDecorators && {
          decorator: {
            legacy: true,
            emitDecoratorMetadata: hasDecoratorMetadata,
          },
        }),
      });
    }

    if (result.errors.length > 0) {
      // eslint-disable-next-line no-console
      console.error(`Errors transforming ${file}:`);
      for (const error of result.errors) {
        // eslint-disable-next-line no-console
        console.error(`  ${error.message}`);
      }
      hasErrors = true;
      continue;
    }

    ensureDirectory(path.dirname(outputFilePath));
    writeFileSync(outputFilePath, result.code);

    if (generateDeclarations && result.declaration && !hasIsolatedDeclarationsErrors) {
      writeFileSync(declarationFilePath, result.declaration);
    }
  }

  if (options.assets) {
    copyAssets(options.assets, outputPath, root);
  }

  return { success: !hasErrors };
}
/* eslint-enable security/detect-non-literal-fs-filename */
