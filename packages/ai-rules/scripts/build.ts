import { execSync } from "node:child_process";
import { copyFile } from "node:fs/promises";
import { join, relative } from "node:path";

import { buildProfiles } from "./buildProfiles";
import { PATHS } from "./constants";

const { packageRoot, outputDirectory } = PATHS;

const verbose = false;

async function build() {
  console.log(`🚀 Building profiles...\n`);

  const logs = await buildProfiles({ verbose });

  console.log(logs.flat().join("\n"));
  console.log(`\n✨ Profiles built. See ${relative(process.cwd(), outputDirectory)}.`);

  // Copy README.md and package.json to output directory root for NPM publishing
  await Promise.all([
    copyFile(join(packageRoot, "README.md"), join(outputDirectory, "README.md")),
    copyFile(join(packageRoot, "package.json"), join(outputDirectory, "package.json")),
  ]);

  // Format markdown files with prettier, ignoring .gitignore
  const output = execSync(
    `npx prettier --write --ignore-path /dev/null "${outputDirectory}/**/*.md"`,
    { stdio: "pipe", timeout: 60_000, encoding: "utf8" },
  );
  if (verbose && output) {
    console.log(output.trim());
  }
}

// eslint-disable-next-line unicorn/prefer-top-level-await
void build();
