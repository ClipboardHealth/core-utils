#!/usr/bin/env node
import { execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { Command, Option } from "@commander-js/extra-typings";
import { confirm, select } from "@inquirer/prompts";

import { description, name, version } from "../../package.json";

const PROFILES = {
  frontend: ["common", "frontend"],
  backend: ["common", "backend"],
  fullstack: ["common", "frontend", "backend"],
  common: ["common"],
} as const;

type Profile = keyof typeof PROFILES;

const VALID_RULESETS = ["common", "frontend", "backend"] as const;
type Ruleset = (typeof VALID_RULESETS)[number];

interface PackageJson {
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  [key: string]: unknown;
}

function detectProjectType(): Profile {
  try {
    const packagePath = path.join(process.cwd(), "package.json");
    if (!fs.existsSync(packagePath)) {
      return "common";
    }

    const package_ = JSON.parse(fs.readFileSync(packagePath, "utf8")) as PackageJson;
    const deps = { ...package_.dependencies, ...package_.devDependencies };

    const hasReact = "react" in deps || "react-dom" in deps || "react-native" in deps;
    const hasNest = "@nestjs/core" in deps || "@nestjs/common" in deps;

    if (hasReact && hasNest) {return "fullstack";}
    if (hasReact) {return "frontend";}
    if (hasNest) {return "backend";}
    return "common";
  } catch {
    return "common";
  }
}

function updatePackageJson(profile: Profile, options: { postinstall: boolean }): void {
  const packagePath = path.join(process.cwd(), "package.json");

  if (!fs.existsSync(packagePath)) {
    console.log("⚠️  No package.json found, skipping package.json update");
    return;
  }

  try {
    const package_ = JSON.parse(fs.readFileSync(packagePath, "utf8")) as PackageJson;
    package_.scripts = package_.scripts || {};

    // Add sync script
    package_.scripts["sync-ai-rules"] = `npx @clipboard-health/ai-rules apply --profile=${profile}`;

    // Add postinstall if requested
    if (options.postinstall) {
      const existingPostinstall = package_.scripts["postinstall"];
      package_.scripts["postinstall"] = existingPostinstall
        ? `${existingPostinstall} && npm run sync-ai-rules`
        : "npm run sync-ai-rules";
    }

    // Write back with proper formatting
    fs.writeFileSync(packagePath, `${JSON.stringify(package_, null, 2)  }\n`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`⚠️  Failed to update package.json: ${message}`);
    console.error("   You may need to add the sync script manually.");
  }
}


function applyRules(categories: readonly string[], dryRun = false): void {
  // From dist/bin/cli.js, go up to package root: ../../
  const sourceDirectory = path.join(__dirname, "..", "..", ".ruler");
  const targetDirectory = process.cwd();
  const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "ai-rules-"));
  const temporaryRulerDirectory = path.join(temporaryDirectory, ".ruler");

  try {
    if (dryRun) {
      console.log("🔍 Dry run mode - no files will be created\n");
    }

    console.log(`Applying rules: ${categories.join(", ")}...`);

    // 1. Create temp .ruler directory with selected categories
    fs.mkdirSync(temporaryRulerDirectory, { recursive: true });

    for (const category of categories) {
      const sourceCategoryDirectory = path.join(sourceDirectory, category);
      const targetCategoryDirectory = path.join(temporaryRulerDirectory, category);

      if (fs.existsSync(sourceCategoryDirectory)) {
        fs.cpSync(sourceCategoryDirectory, targetCategoryDirectory, { recursive: true });
        console.log(`  ✓ Included ${category} rules`);
      }
    }

    // Copy ruler.toml configuration to control which agents to generate
    const rulerConfigPath = path.join(sourceDirectory, "ruler.toml");
    if (fs.existsSync(rulerConfigPath)) {
      fs.copyFileSync(rulerConfigPath, path.join(temporaryRulerDirectory, "ruler.toml"));
      console.log("  ✓ Using ruler.toml configuration");
    }

    // 2. Run Ruler in temp directory
    console.log("\nGenerating AI agent config files...");
    execSync("npx --yes @intellectronica/ruler@latest apply", {
      cwd: temporaryDirectory,
      stdio: "inherit",
    });

    // 3. Copy generated files to target directory
    if (dryRun) {
      console.log("\n📋 Would generate these files:");
    } else {
      console.log("\nCopying generated files to your project...");
    }

    const filesToCopy = [
      "AGENTS.md", // GitHub Copilot, OpenAI Codex, and other AGENTS.md-compatible assistants
      "CLAUDE.md", // Claude Code
      ".cursor", // Cursor AI
    ];

    let copiedCount = 0;
    for (const file of filesToCopy) {
      const sourcePath = path.join(temporaryDirectory, file);
      const targetPath = path.join(targetDirectory, file);

      if (fs.existsSync(sourcePath)) {
        if (dryRun) {
          const stat = fs.statSync(sourcePath);
          const size = stat.isDirectory() ? "directory" : `${Math.round(stat.size / 1024)}KB`;
          console.log(`  ✓ ${file} (${size})`);
        } else {
          const stat = fs.statSync(sourcePath);
          if (stat.isDirectory()) {
            fs.cpSync(sourcePath, targetPath, { recursive: true });
          } else {
            fs.copyFileSync(sourcePath, targetPath);
          }

          console.log(`  ✓ ${file}`);
        }

        copiedCount += 1;
      }
    }

    if (dryRun) {
      console.log(`\n✅ Dry run complete!`);
      console.log(`Would generate ${copiedCount} file(s) for your AI coding assistants.`);
      console.log("\n💡 Run without --dry-run to actually create the files.");
    } else {
      console.log(`\n✅ Successfully applied rules!`);
      console.log(`Generated ${copiedCount} file(s) for your AI coding assistants.`);

      // Show helpful next steps
      console.log("\n📝 Next steps:");
      console.log("  1. Check the generated files");
      console.log("  2. Your AI assistants will automatically use these rules");
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("\n❌ Error applying rules:", message);
    process.exit(1);
  } finally {
    // Cleanup temp directory
    fs.rmSync(temporaryDirectory, { recursive: true, force: true });
  }
}

const program = new Command()
  .name(String(name))
  .description(String(description))
  .version(String(version));

program
  .command("init")
  .description("Interactive setup for your project")
  .addOption(
    new Option("--profile <profile>", "Use specific profile (non-interactive)").choices([
      "frontend",
      "backend",
      "fullstack",
      "common",
    ]),
  )
  .action(async (options: { profile?: string }) => {
    console.log("🎯 AI Rules Setup");
    console.log("=================\n");

    try {
      const isInteractive = !options.profile;

      // 1. Detect project type
      const detectedProfile = detectProjectType();
      if (isInteractive) {
        console.log(`📊 Detected project type: ${detectedProfile}\n`);
      }

      // 2. Prompt for profile or use provided one
      let selectedProfile: Profile;
      if (options.profile) {
        // Validate the profile
        if (!["frontend", "backend", "fullstack", "common"].includes(options.profile)) {
          console.error(`Error: Invalid profile "${options.profile}"`);
          console.error("Valid profiles: frontend, backend, fullstack, common");
          process.exit(1);
        }

        selectedProfile = options.profile as Profile;
        console.log(`Using profile: ${selectedProfile}\n`);
      } else {
        selectedProfile = await select({
          message: "Which profile would you like to use?",
          choices: [
            {
              name: `${detectedProfile} (detected)`,
              value: detectedProfile,
              description: PROFILES[detectedProfile].join(", "),
            },
            ...(["frontend", "backend", "fullstack", "common"] as Profile[])
              .filter((p) => p !== detectedProfile)
              .map((p) => ({
                name: p,
                value: p,
                description: PROFILES[p].join(", "),
              })),
          ],
        });
      }

      // 3. Ask about package.json (interactive only)
      let addScript = false;
      let postinstall = false;

      if (isInteractive && fs.existsSync("package.json")) {
        addScript = await confirm({
          message: 'Add "sync-ai-rules" script to package.json?',
          default: true,
        });

        if (addScript) {
          postinstall = await confirm({
            message: "Run automatically on npm install? (postinstall)",
            default: false,
          });
        }
      }

      console.log("\n🚀 Setting up...\n");

      // 5. Update package.json
      if (addScript) {
        updatePackageJson(selectedProfile, { postinstall });
        console.log("✅ Updated package.json");
        console.log(`   Added: "sync-ai-rules" script`);
        if (postinstall) {
          console.log("   Added: postinstall hook");
        }
      }

      // 6. Generate files
      console.log("\n📝 Generating AI agent files...\n");
      applyRules(PROFILES[selectedProfile]);

      // 8. Show success message
      console.log("\n🎉 Setup complete!\n");
      console.log("Generated files:");
      console.log("  • AGENTS.md");
      console.log("  • CLAUDE.md");
      console.log("  • .cursor/rules/\n");

      if (addScript) {
        console.log("📝 To regenerate rules later:");
        console.log("   npm run sync-ai-rules\n");
      }

      console.log("💡 Your AI assistants will now follow these rules!");
    } catch (error) {
      if ((error as { name?: string }).name === "ExitPromptError") {
        console.log("\n❌ Setup cancelled");
        process.exit(0);
      }

      throw error;
    }
  });

program
  .command("list")
  .alias("ls")
  .description("List available profiles and rulesets")
  .action(() => {
    console.log("📋 Available Profiles:\n");
    console.log("  frontend   - Common + Frontend (React, hooks, styling)");
    console.log("  backend    - Common + Backend (NestJS, APIs)");
    console.log("  fullstack  - All rules (frontend + backend)");
    console.log("  common     - Common rules only (TypeScript, testing)\n");

    console.log("📦 Available Rulesets:\n");
    console.log("  common     - TypeScript, testing, code style");
    console.log("  frontend   - React patterns, hooks, performance");
    console.log("  backend    - NestJS APIs, three-tier architecture\n");

    console.log("💡 Usage Examples:\n");
    console.log("  npx @clipboard-health/ai-rules init");
    console.log("  npx @clipboard-health/ai-rules apply --profile=frontend");
    console.log("  npx @clipboard-health/ai-rules apply --ruleset=common,backend\n");
  });

program
  .command("apply")
  .description("Generate AI agent configuration files for your project.")
  .addOption(
    new Option("-p, --profile <profile>", "Apply a predefined profile").choices([
      "frontend",
      "backend",
      "fullstack",
      "common",
    ]),
  )
  .addOption(new Option("-r, --ruleset <rulesets>", "Apply specific rulesets (comma-separated)"))
  .addOption(
    new Option("--dry-run", "Show what would be generated without creating files").default(false),
  )
  .action((options: { profile?: Profile; ruleset?: string; dryRun?: boolean }) => {
    const { profile, ruleset } = options;

    // Validate that at least one option is provided
    if (!profile && !ruleset) {
      console.error("Error: Please specify either --profile or --ruleset");
      console.log("\nExamples:");
      console.log("  --profile=frontend");
      console.log("  --profile=backend");
      console.log("  --profile=fullstack");
      console.log("  --profile=common");
      console.log("  --ruleset=common,frontend");
      console.log("  --ruleset=common,backend");
      process.exit(1);
    }

    // Validate that both options are not provided
    if (profile && ruleset) {
      console.error("Error: Please specify either --profile or --ruleset, not both");
      process.exit(1);
    }

    let categoriesToApply: readonly string[];

    if (profile) {
      // Use predefined profile
      categoriesToApply = PROFILES[profile];
    } else if (ruleset) {
      // Parse and validate custom rulesets
      const rulesets = ruleset.split(",").map((r) => r.trim()) as Ruleset[];

      // Validate all rulesets
      const invalidRulesets = rulesets.filter((r) => !VALID_RULESETS.includes(r));
      if (invalidRulesets.length > 0) {
        console.error(`Error: Invalid ruleset(s): ${invalidRulesets.join(", ")}`);
        console.log(`\nValid rulesets: ${VALID_RULESETS.join(", ")}`);
        process.exit(1);
      }

      // Remove duplicates and ensure consistent order
      categoriesToApply = [...new Set(rulesets)];
    } else {
      // This should never happen due to earlier validation
      console.error("Error: No profile or ruleset specified");
      process.exit(1);
    }

    applyRules(categoriesToApply, options.dryRun);
  });

// Show help if no command provided
if (process.argv.length === 2) {
  program.help();
}

program.parse();
