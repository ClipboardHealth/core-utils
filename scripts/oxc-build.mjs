#!/usr/bin/env node

/**
 * OXC Build Script
 *
 * This script uses oxc-transform to compile TypeScript files to JavaScript.
 * Declaration files (.d.ts) are generated using tsc with emitDeclarationOnly.
 * It's designed to be used as a replacement for tsc in Nx build targets.
 *
 * Usage: node scripts/oxc-build.mjs --project <project-name> --outputPath <output-path> --tsConfig <tsconfig-path> --assets <assets>
 */

import { transform } from "oxc-transform";
import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  cpSync,
  existsSync,
  readdirSync,
  statSync,
  unlinkSync,
  rmdirSync,
} from "node:fs";
import { dirname, join, relative, resolve, extname, basename } from "node:path";
import { parseArgs } from "node:util";
import { execSync } from "node:child_process";

const { values: args } = parseArgs({
  options: {
    project: { type: "string" },
    outputPath: { type: "string" },
    tsConfig: { type: "string" },
    assets: { type: "string" },
    sourceRoot: { type: "string" },
  },
  strict: false, // Allow unknown options (e.g., --no-interactive from Nx)
});

const workspaceRoot = process.cwd();

/**
 * Recursively find all TypeScript files in a directory
 */
function findTsFiles(dir, files = []) {
  const entries = readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);

    if (entry.isDirectory()) {
      findTsFiles(fullPath, files);
    } else if (
      entry.isFile() &&
      /\.tsx?$/.test(entry.name) &&
      !entry.name.endsWith(".d.ts") &&
      !entry.name.includes(".spec.") &&
      !entry.name.includes(".test.")
    ) {
      files.push(fullPath);
    }
  }

  return files;
}

/**
 * Transform a single TypeScript file using oxc-transform
 */
async function transformFile(filePath, sourceRoot, outputPath) {
  const sourceCode = readFileSync(filePath, "utf-8");
  const relativePath = relative(sourceRoot, filePath);
  const outputFilePath = join(
    outputPath,
    relativePath.replace(".tsx", ".js").replace(".ts", ".js"),
  );
  const declarationFilePath = join(
    outputPath,
    relativePath.replace(".tsx", ".d.ts").replace(".ts", ".d.ts"),
  );

  const result = await transform(filePath, sourceCode, {
    typescript: {
      onlyRemoveTypeImports: true,
    },
  });

  if (result.errors && result.errors.length > 0) {
    console.error(`Errors transforming ${filePath}:`);
    for (const error of result.errors) {
      console.error(`  ${JSON.stringify(error, null, 2)}`);
    }
    process.exit(1);
  }

  // Ensure output directory exists
  mkdirSync(dirname(outputFilePath), { recursive: true });

  // Write the transformed JavaScript
  writeFileSync(outputFilePath, result.code);

  // Write the declaration file if generated
  if (result.declaration) {
    writeFileSync(declarationFilePath, result.declaration);
  }

  return { js: outputFilePath, dts: declarationFilePath };
}

/**
 * Copy assets to output directory
 */
function copyAssets(assets, projectRoot, outputPath) {
  if (!assets) return;

  let assetList;
  try {
    assetList = JSON.parse(assets);
  } catch {
    // If it's not JSON, treat it as a single asset path
    assetList = [assets];
  }

  for (const asset of assetList) {
    if (typeof asset === "string") {
      // Simple string asset (e.g., "packages/util-ts/*.md")
      const assetPath = resolve(workspaceRoot, asset);
      const assetDir = dirname(assetPath);
      const pattern = basename(assetPath);

      if (existsSync(assetDir)) {
        const files = readdirSync(assetDir);
        for (const file of files) {
          if (pattern.includes("*")) {
            const regex = new RegExp("^" + pattern.replaceAll("*", ".*") + "$");
            if (regex.test(file)) {
              const srcPath = join(assetDir, file);
              const destPath = join(outputPath, file);
              if (statSync(srcPath).isFile()) {
                cpSync(srcPath, destPath);
              }
            }
          } else if (file === pattern) {
            const srcPath = join(assetDir, file);
            const destPath = join(outputPath, file);
            cpSync(srcPath, destPath);
          }
        }
      }
    } else if (typeof asset === "object" && asset.input && asset.glob && asset.output) {
      // Complex asset object
      const inputDir = resolve(workspaceRoot, asset.input);
      const outputDir = join(outputPath, asset.output);

      if (existsSync(inputDir)) {
        copyGlobAssets(inputDir, outputDir, asset.glob);
      }
    }
  }
}

/**
 * Copy files matching a glob pattern
 */
function copyGlobAssets(inputDir, outputDir, glob, currentPath = "") {
  const fullInputPath = join(inputDir, currentPath);

  if (!existsSync(fullInputPath)) return;

  const entries = readdirSync(fullInputPath, { withFileTypes: true });

  for (const entry of entries) {
    const relativePath = join(currentPath, entry.name);
    const srcPath = join(inputDir, relativePath);
    const destPath = join(outputDir, relativePath);

    if (entry.isDirectory()) {
      copyGlobAssets(inputDir, outputDir, glob, relativePath);
    } else if (entry.isFile()) {
      // Simple glob matching
      const pattern = glob.replaceAll("**", ".*").replaceAll("*", "[^/]*").replaceAll("!", "^");
      const isNegated = glob.startsWith("!");
      const regex = new RegExp(isNegated ? pattern.slice(1) : pattern);
      const matches = regex.test(entry.name);

      if (isNegated ? !matches : matches) {
        mkdirSync(dirname(destPath), { recursive: true });
        cpSync(srcPath, destPath);
      }
    }
  }
}

/**
 * Copy package.json to output directory
 */
function copyPackageJson(projectRoot, outputPath) {
  const packageJsonPath = join(projectRoot, "package.json");
  if (existsSync(packageJsonPath)) {
    const destPath = join(outputPath, "package.json");
    cpSync(packageJsonPath, destPath);
  }
}

/**
 * Recursively copy directory contents
 */
function copyDirContents(src, dest) {
  if (!existsSync(src)) return;

  mkdirSync(dest, { recursive: true });
  const entries = readdirSync(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = join(src, entry.name);
    const destPath = join(dest, entry.name);

    if (entry.isDirectory()) {
      copyDirContents(srcPath, destPath);
    } else {
      cpSync(srcPath, destPath);
    }
  }
}

/**
 * Recursively remove directory
 */
function rmDir(dir) {
  if (!existsSync(dir)) return;

  const entries = readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      rmDir(fullPath);
    } else {
      unlinkSync(fullPath);
    }
  }
  rmdirSync(dir);
}

/**
 * Generate declaration files using tsc with emitDeclarationOnly
 */
function generateDeclarations(tsConfigPath, outDir, projectRoot, sourceRoot) {
  if (!tsConfigPath || !existsSync(resolve(workspaceRoot, tsConfigPath))) {
    console.log("  Skipping declaration generation (no tsconfig provided)");
    return;
  }

  console.log("  Generating declaration files with tsc...");

  const tempDeclDir = join(outDir, ".dts-temp");

  try {
    // Use tsc to generate only declaration files to a temp directory
    const tscCommand = `npx tsc --project ${resolve(workspaceRoot, tsConfigPath)} --emitDeclarationOnly --declaration --declarationDir ${tempDeclDir}`;
    execSync(tscCommand, {
      cwd: workspaceRoot,
      stdio: "pipe",
    });

    // Find the actual declaration files (they might be nested)
    // and copy them to the correct location
    const srcRelative = relative(workspaceRoot, sourceRoot);
    const nestedDeclDir = join(tempDeclDir, srcRelative);

    if (existsSync(nestedDeclDir)) {
      // Copy from nested location to output src
      copyDirContents(nestedDeclDir, join(outDir, "src"));
    } else if (existsSync(tempDeclDir)) {
      // Copy directly if not nested
      copyDirContents(tempDeclDir, join(outDir, "src"));
    }

    // Clean up temp directory
    rmDir(tempDeclDir);

    console.log("  Declaration files generated");
  } catch (error) {
    // Clean up temp directory on error
    rmDir(tempDeclDir);

    // tsc might fail on type errors, but we still want to continue
    // since oxc already compiled the JS files
    console.warn("  Warning: tsc declaration generation had issues (type errors may exist)");
    if (error.stderr) {
      console.warn(`  ${error.stderr.toString().split("\n").slice(0, 5).join("\n  ")}`);
    }
  }
}

async function main() {
  const { project, outputPath, tsConfig, assets, sourceRoot } = args;

  if (!project || !outputPath) {
    console.error(
      "Usage: node scripts/oxc-build.mjs --project <project-name> --outputPath <output-path> --tsConfig <tsconfig-path>",
    );
    process.exit(1);
  }

  const projectRoot = join(workspaceRoot, "packages", project);
  const srcDir = sourceRoot ? resolve(workspaceRoot, sourceRoot) : join(projectRoot, "src");
  const outDir = resolve(workspaceRoot, outputPath);

  console.log(`Building ${project} with oxc-transform...`);
  console.log(`  Source: ${srcDir}`);
  console.log(`  Output: ${outDir}`);

  // Find all TypeScript files
  const tsFiles = findTsFiles(srcDir);
  console.log(`  Found ${tsFiles.length} TypeScript files`);

  // Transform each file
  let successCount = 0;
  for (const file of tsFiles) {
    try {
      await transformFile(file, srcDir, join(outDir, "src"));
      successCount++;
    } catch (error) {
      console.error(`Error transforming ${file}:`, error.message);
      process.exit(1);
    }
  }

  console.log(`  Transformed ${successCount} files`);

  // Generate declaration files using tsc
  generateDeclarations(tsConfig, outDir, projectRoot, srcDir);

  // Copy assets
  if (assets) {
    console.log("  Copying assets...");
    copyAssets(assets, projectRoot, outDir);
  }

  // Copy package.json
  copyPackageJson(projectRoot, outDir);

  console.log(`Build complete: ${project}`);
}

main().catch((error) => {
  console.error("Build failed:", error);
  process.exit(1);
});
