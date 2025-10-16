/* eslint-disable security/detect-non-literal-fs-filename */
/* eslint-disable no-console */
import { execSync } from "node:child_process";
import { constants } from "node:fs";
import { access, copyFile, cp, mkdir, mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";

import { toErrorMessage } from "@clipboard-health/util-ts";

const PACKAGE_ROOT = join(__dirname, "..");
const OUTPUT_DIRECTORY = join(PACKAGE_ROOT, "..", "..", "dist", "packages", "ai-rules");
const PROFILES = {
  frontend: ["common", "frontend"] as const,
  backend: ["common", "backend"] as const,
  fullstack: ["common", "frontend", "backend"] as const,
  common: ["common"] as const,
} as const;

type ProfileName = keyof typeof PROFILES;

async function exists(path: string): Promise<boolean> {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Builds a single profile by combining rule categories and running Ruler.
 */
async function buildProfile(params: {
  profileName: ProfileName;
  categories: readonly string[];
  verbose: boolean;
}): Promise<string[]> {
  const { profileName, categories, verbose } = params;
  const logs: string[] = [];

  logs.push(`📦 Building ${profileName} with ${categories.join(", ")}`);

  const sourceDirectory = join(PACKAGE_ROOT, ".ruler");
  const temporaryDirectory = await mkdtemp(join(tmpdir(), `ai-rules-${profileName}-`));
  const PATHS = {
    source: sourceDirectory,
    temporary: temporaryDirectory,
    temporaryRuler: join(temporaryDirectory, ".ruler"),
    output: join(OUTPUT_DIRECTORY, profileName),
    rulerConfig: join(sourceDirectory, "ruler.toml"),
  };

  try {
    // Create temp .ruler directory with selected categories
    await mkdir(PATHS.temporaryRuler, { recursive: true });
    await Promise.all(
      categories.map(async (category) => {
        const source = join(PATHS.source, category);
        if (await exists(source)) {
          await cp(source, join(PATHS.temporaryRuler, category), {
            recursive: true,
          });
        }
      }),
    );

    // Copy ruler.toml
    if (await exists(PATHS.rulerConfig)) {
      await copyFile(PATHS.rulerConfig, join(PATHS.temporaryRuler, "ruler.toml"));
    }

    // Run Ruler to generate files
    const output = execSync("npx @intellectronica/ruler apply", {
      cwd: PATHS.temporary,
      stdio: "pipe",
      timeout: 60_000,
      encoding: "utf8",
    });
    if (verbose && output) {
      logs.push(output.trim());
    }

    // Copy generated files to output
    await mkdir(PATHS.output, { recursive: true });
    await Promise.all(
      ["AGENTS.md", "CLAUDE.md"].map(async (file) => {
        const paths = {
          source: join(PATHS.temporary, file),
          target: join(PATHS.output, file),
        };
        if (await exists(paths.source)) {
          const statResult = await stat(paths.source);
          await (statResult.isDirectory()
            ? cp(paths.source, paths.target, { recursive: true })
            : copyFile(paths.source, paths.target));
        }
      }),
    );

    return logs;
  } catch (error) {
    throw new Error(`Error building ${profileName}: ${toErrorMessage(error)}`);
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}

async function buildAllProfiles() {
  console.log(`🚀 Building profiles...\n`);
  if (await exists(OUTPUT_DIRECTORY)) {
    await rm(OUTPUT_DIRECTORY, { recursive: true, force: true });
  }

  await mkdir(OUTPUT_DIRECTORY, { recursive: true });

  const logs = await Promise.all(
    Object.entries(PROFILES).map(
      async ([profileName, categories]) =>
        await buildProfile({ profileName: profileName as ProfileName, categories, verbose: false }),
    ),
  );

  console.log(logs.flat().join("\n"));

  // Copy README.md and package.json to output directory root for NPM publishing
  await Promise.all([
    copyFile(join(PACKAGE_ROOT, "README.md"), join(OUTPUT_DIRECTORY, "README.md")),
    copyFile(join(PACKAGE_ROOT, "package.json"), join(OUTPUT_DIRECTORY, "package.json")),
  ]);

  console.log(`\n✨ Profiles built. See ${relative(process.cwd(), OUTPUT_DIRECTORY)}.`);
}

// eslint-disable-next-line unicorn/prefer-top-level-await
void buildAllProfiles();

/* eslint-enable security/detect-non-literal-fs-filename */
/* eslint-enable no-console */
