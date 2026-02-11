import { copyFile, cp, mkdir, rm } from "node:fs/promises";
import { devNull } from "node:os";
import path from "node:path";

import { PATHS } from "./constants";
import { execAndLog } from "./execAndLog";

const { packageRoot, outputDirectory } = PATHS;

const params = {
  timeout: 60_000,
  verbose: false,
};

async function build() {
  const scriptsOutput = path.join(outputDirectory, "scripts");

  console.log(`🚀 Building ai-rules...\n`);

  await rm(outputDirectory, { recursive: true, force: true });
  await mkdir(outputDirectory, { recursive: true });

  await Promise.all([
    cp(path.join(packageRoot, "rules"), path.join(outputDirectory, "rules"), { recursive: true }),
    mkdir(scriptsOutput, { recursive: true }),
    copyFile(path.join(packageRoot, "README.md"), path.join(outputDirectory, "README.md")),
    copyFile(path.join(packageRoot, "package.json"), path.join(outputDirectory, "package.json")),
  ]);

  console.log(`📦 Copied rules/ to dist`);

  await Promise.all([
    execAndLog({
      ...params,
      command: [
        "npx",
        "prettier",
        "--write",
        "--ignore-path",
        devNull,
        `${outputDirectory}/**/*.md`,
      ],
    }),
    execAndLog({
      ...params,
      command: [
        "npx",
        "tsc",
        path.join(packageRoot, "scripts", "sync.ts"),
        "--outDir",
        scriptsOutput,
        "--module",
        "commonjs",
        "--target",
        "es2024",
        "--moduleResolution",
        "node",
        "--esModuleInterop",
        "--skipLibCheck",
      ],
    }),
  ]);

  console.log(`\n✨ Build complete. See ${path.relative(process.cwd(), outputDirectory)}.`);
}

// eslint-disable-next-line unicorn/prefer-top-level-await
void build();
