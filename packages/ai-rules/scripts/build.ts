import { copyFile, mkdir, rm } from "node:fs/promises";
import { devNull } from "node:os";
import { join, relative } from "node:path";

import { buildProfile } from "./buildProfile";
import { PATHS, type ProfileName, PROFILES } from "./constants";
import { execAndLog } from "./execAndLog";

const { packageRoot, outputDirectory } = PATHS;

const params = {
  timeout: 60_000,
  verbose: false,
};

async function build() {
  const scriptsOutput = join(outputDirectory, "scripts");

  console.log(`🚀 Building profiles...\n`);

  await rm(outputDirectory, { recursive: true, force: true });
  await mkdir(outputDirectory, { recursive: true });

  const [logs] = await Promise.all([
    Promise.all(
      Object.entries(PROFILES).map(
        async ([profileName, categories]) =>
          await buildProfile({ ...params, categories, profileName: profileName as ProfileName }),
      ),
    ),
    mkdir(scriptsOutput, { recursive: true }),
    copyFile(join(packageRoot, "README.md"), join(outputDirectory, "README.md")),
    copyFile(join(packageRoot, "package.json"), join(outputDirectory, "package.json")),
  ]);

  console.log(logs.flat().join("\n"));
  console.log(`\n✨ Profiles built. See ${relative(process.cwd(), outputDirectory)}.`);

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
        join(packageRoot, "scripts", "sync.ts"),
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
}

// eslint-disable-next-line unicorn/prefer-top-level-await
void build();
