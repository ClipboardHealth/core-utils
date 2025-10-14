#!/usr/bin/env node

/**
 * Pre-generates AI agent configuration files for all profiles.
 * This script runs during package build to create ready-to-copy files.
 */

// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
const { execSync } = require("node:child_process");
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
const fs = require("node:fs");
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
const os = require("node:os");
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
const path = require("node:path");

const PROFILES = {
  frontend: ["common", "frontend"],
  backend: ["common", "backend"],
  fullstack: ["common", "frontend", "backend"],
  common: ["common"],
};

/**
 * Builds a single profile by combining rule categories and running Ruler.
 * @param {string} profileName - The name of the profile to build.
 * @param {readonly string[]} categories - The rule categories to include.
 */
function buildProfile(profileName, categories) {
  console.log(`\n📦 Building profile: ${profileName}`);
  console.log(`   Categories: ${categories.join(", ")}`);

  const sourceDirectory = path.join(__dirname, "..", ".ruler");
  const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), `ai-rules-${profileName}-`));
  const temporaryRulerDirectory = path.join(temporaryDirectory, ".ruler");
  const outputDirectory = path.join(__dirname, "..", "dist", profileName);

  try {
    // 1. Create temp .ruler directory with selected categories
    fs.mkdirSync(temporaryRulerDirectory, { recursive: true });

    for (const category of categories) {
      const sourceCategoryDirectory = path.join(sourceDirectory, category);
      const targetCategoryDirectory = path.join(temporaryRulerDirectory, category);

      if (fs.existsSync(sourceCategoryDirectory)) {
        fs.cpSync(sourceCategoryDirectory, targetCategoryDirectory, {
          recursive: true,
        });
        console.log(`   ✓ Included ${category} rules`);
      }
    }

    // Copy ruler.toml
    const rulerConfigPath = path.join(sourceDirectory, "ruler.toml");

    if (fs.existsSync(rulerConfigPath)) {
      fs.copyFileSync(rulerConfigPath, path.join(temporaryRulerDirectory, "ruler.toml"));
    }

    // 2. Run Ruler to generate files
    console.log("   ⚙️  Running Ruler...");
    execSync("npx --yes @intellectronica/ruler@latest apply", {
      cwd: temporaryDirectory,
      stdio: "pipe",
    });

    // 3. Copy generated files to dist
    fs.mkdirSync(outputDirectory, { recursive: true });

    const filesToCopy = ["AGENTS.md", "CLAUDE.md", ".cursor"];

    for (const file of filesToCopy) {
      const sourcePath = path.join(temporaryDirectory, file);
      const targetPath = path.join(outputDirectory, file);

      if (fs.existsSync(sourcePath)) {
        const stat = fs.statSync(sourcePath);

        if (stat.isDirectory()) {
          fs.cpSync(sourcePath, targetPath, { recursive: true });
        } else {
          fs.copyFileSync(sourcePath, targetPath);
        }

        console.log(`   ✓ Generated ${file}`);
      }
    }

    console.log(`   ✅ Profile built: dist/${profileName}/`);
  } catch (error) {
    console.error(`   ❌ Error building ${profileName}:`, error.message);
    process.exit(1);
  } finally {
    // Cleanup temp directory
    fs.rmSync(temporaryDirectory, { recursive: true, force: true });
  }
}

// Clean dist directory
const distributionDirectory = path.join(__dirname, "..", "dist");

if (fs.existsSync(distributionDirectory)) {
  fs.rmSync(distributionDirectory, { recursive: true, force: true });
}

fs.mkdirSync(distributionDirectory, { recursive: true });

// Build all profiles
console.log("🚀 Building AI Rules profiles...");
console.log("================================\n");

for (const [profileName, categories] of Object.entries(PROFILES)) {
  buildProfile(profileName, categories);
}

console.log("\n✨ All profiles built successfully!");
console.log("\nOutput structure:");
console.log("  dist/");
console.log("    ├── frontend/    (AGENTS.md, CLAUDE.md, .cursor/)");
console.log("    ├── backend/     (AGENTS.md, CLAUDE.md, .cursor/)");
console.log("    ├── fullstack/   (AGENTS.md, CLAUDE.md, .cursor/)");
console.log("    └── common/      (AGENTS.md, CLAUDE.md, .cursor/)");
