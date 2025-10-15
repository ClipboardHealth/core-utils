import { execSync } from "node:child_process";
import { constants } from "node:fs";
import { access, copyFile, cp, mkdir, mkdtemp, readdir, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";

const OUTPUT_DIRECTORY = join(__dirname, "..", "..", "..", "dist", "packages", "ai-rules");
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
}): Promise<void> {
  const { profileName, categories, verbose } = params;

  console.log(`\n📦 Building profile: ${profileName}`);
  console.log(`   Categories: ${categories.join(", ")}`);

  const sourceDirectory = join(__dirname, "..", ".ruler");
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
    console.log("   ⚙️  Running Ruler...");
    execSync("npx --yes @intellectronica/ruler@latest apply", {
      cwd: PATHS.temporary,
      stdio: verbose ? "inherit" : "pipe",
      timeout: 60_000,
    });

    // Copy generated files to dist
    await mkdir(PATHS.output, { recursive: true });
    await Promise.all(
      (["AGENTS.md", "CLAUDE.md"] as const).map(async (file) => {
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

    console.log(`   ✅ Profile built: dist/${profileName}/`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`   ❌ Error building ${profileName}:`, message);
    return;
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}

async function buildAllProfiles() {
  if (await exists(OUTPUT_DIRECTORY)) {
    await rm(OUTPUT_DIRECTORY, { recursive: true, force: true });
  }

  await mkdir(OUTPUT_DIRECTORY, { recursive: true });

  // Build profiles sequentially to keep logs ordered
  for (const [profileName, categories] of Object.entries(PROFILES)) {
    // eslint-disable-next-line no-await-in-loop
    await buildProfile({ profileName: profileName as ProfileName, categories, verbose: false });
  }

  const profileChecks = await Promise.all(
    Object.keys(PROFILES).map(async (profileName) => ({
      profileName,
      exists: await exists(join(OUTPUT_DIRECTORY, profileName)),
    })),
  );

  const failedProfiles = profileChecks
    .filter((check) => !check.exists)
    .map((check) => check.profileName);

  if (failedProfiles.length > 0) {
    throw new Error(`Failed to build profiles: ${failedProfiles.join(", ")}`);
  }

  console.log("\n✨ All profiles built successfully!\n");
  console.log(relative(process.cwd(), OUTPUT_DIRECTORY));

  const profiles = await readdir(OUTPUT_DIRECTORY);
  const profileFiles = await Promise.all(
    profiles.map(async (profile) => ({
      profile,
      files: await readdir(join(OUTPUT_DIRECTORY, profile)),
    })),
  );

  const maxProfileLength = Math.max(...profileFiles.map(({ profile }) => profile.length));
  for (const [index, { profile, files }] of profileFiles.entries()) {
    const isLast = index === profiles.length - 1;
    const prefix = isLast ? "└──" : "├──";
    const paddedProfile = `${profile}/`.padEnd(maxProfileLength + 1);
    console.log(`  ${prefix} ${paddedProfile}    (${files.join(", ")})`);
  }
}

// eslint-disable-next-line unicorn/prefer-top-level-await
void buildAllProfiles();
