import { exec } from "node:child_process";
import { copyFile, mkdir } from "node:fs/promises";
import { join, relative } from "node:path";
import { promisify } from "node:util";

import { buildProfiles } from "./buildProfiles";
import { PATHS } from "./constants";

const execAsync = promisify(exec);

const { packageRoot, outputDirectory } = PATHS;

const params = {
  timeout: 60_000,
  verbose: false,
};

async function build() {
  console.log(`🚀 Building profiles...\n`);

  const logs = await buildProfiles(params);

  console.log(logs.flat().join("\n"));
  console.log(`\n✨ Profiles built. See ${relative(process.cwd(), outputDirectory)}.`);

  const { timeout, verbose } = params;
  const scriptsOutput = join(outputDirectory, "scripts");
  const syncPaths = {
    input: join(packageRoot, "scripts", "sync.ts"),
  };
  await mkdir(scriptsOutput, { recursive: true });

  const [prettierResult, tscResult] = await Promise.all([
    // Format markdown files with prettier, ignoring .gitignore
    execAsync(`npx prettier --write --ignore-path /dev/null "${outputDirectory}/**/*.md"`, {
      timeout,
    }),
    // Compile sync.ts using tsc
    execAsync(
      `npx tsc "${syncPaths.input}" --outDir "${scriptsOutput}" --module commonjs --target es2022 --moduleResolution node --esModuleInterop --skipLibCheck`,
      { timeout },
    ),
    // Copy README.md and package.json to output directory root for NPM publishing
    copyFile(join(packageRoot, "README.md"), join(outputDirectory, "README.md")),
    copyFile(join(packageRoot, "package.json"), join(outputDirectory, "package.json")),
  ]);

  if (verbose) {
    if (prettierResult.stdout) {
      console.log(prettierResult.stdout.trim());
    }

    if (tscResult.stdout) {
      console.log(tscResult.stdout.trim());
    }
  }
}

// eslint-disable-next-line unicorn/prefer-top-level-await
void build();
