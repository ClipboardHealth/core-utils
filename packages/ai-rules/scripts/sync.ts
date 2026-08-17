/* eslint-disable unicorn/no-process-exit, n/no-process-exit */
import { access, cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import { FILES, type ProfileName, PROFILES } from "./constants";
import { execAndLog } from "./execAndLog";
import { discoverRules, generateAgentsIndex, resolveRules, type RuleMetadata } from "./rules";
import { toErrorMessage } from "./toErrorMessage";

const PATHS = {
  projectRoot: path.join(__dirname, "../../../.."),
  packageRoot: path.join(__dirname, ".."),
};

interface ParsedArguments {
  profile: ProfileName;
  extraIncludes: string[];
  excludes: string[];
}

async function sync() {
  try {
    const parsedArguments = parseArguments();
    const allRules = await discoverRules(path.join(PATHS.packageRoot, "rules"));
    const { rules, unknownIds } = resolveRules({
      rules: allRules,
      profileCategories: PROFILES[parsedArguments.profile].include,
      includes: parsedArguments.extraIncludes,
      excludes: parsedArguments.excludes,
    });
    if (unknownIds.length > 0) {
      console.warn(`⚠️ Ignoring unknown rules: ${unknownIds.join(", ")}`);
      console.warn(`Available rules: ${allRules.map((rule) => rule.id).join(", ")}`);
    }

    if (rules.length === 0) {
      console.error("❌ Error: No rules remaining after excludes");
      process.exit(1);
    }

    const rulesOutput = path.join(PATHS.projectRoot, ".rules");
    await rm(rulesOutput, { recursive: true, force: true });
    await copyRuleFiles(rules, rulesOutput);

    const agentsContent = generateAgentsIndex(rules);
    await writeFile(path.join(PATHS.projectRoot, FILES.agents), agentsContent, "utf8");
    await writeFile(path.join(PATHS.projectRoot, FILES.claude), "@AGENTS.md\n", "utf8");

    console.log(
      `✅ @clipboard-health/ai-rules synced ${parsedArguments.profile} (${rules.length} rules)`,
    );

    await appendOverlay(PATHS.projectRoot);
    await formatOutputFiles({ projectRoot: PATHS.projectRoot });
  } catch (error) {
    // Log error but exit gracefully to avoid breaking installs
    console.error(`⚠️ @clipboard-health/ai-rules sync failed: ${toErrorMessage(error)}`);
    process.exit(0);
  }
}

function isProfileName(value: string): value is ProfileName {
  return value in PROFILES;
}

function parseArguments(): ParsedArguments {
  const processArguments = process.argv.slice(2);

  if (processArguments.length === 0) {
    printUsageAndExit();
  }

  const [profile] = processArguments;
  if (!profile || !isProfileName(profile)) {
    console.error(`❌ Error: Unknown profile "${profile}"`);
    printUsageAndExit();
  }

  const extraIncludes: string[] = [];
  const excludes: string[] = [];
  let mode: "include" | "exclude" | undefined;

  for (const argument of processArguments.slice(1)) {
    if (argument === "--include") {
      mode = "include";
    } else if (argument === "--exclude") {
      mode = "exclude";
    } else if (!mode) {
      console.error(`❌ Error: Unexpected argument "${argument}"`);
      printUsageAndExit();
    } else if (mode === "include") {
      extraIncludes.push(argument);
    } else {
      excludes.push(argument);
    }
  }

  return { profile, extraIncludes, excludes };
}

function printUsageAndExit(): never {
  console.error(`Usage: node sync.js <profile> [--include <ruleId>...] [--exclude <ruleId>...]`);
  console.error(`\nProfiles: ${Object.keys(PROFILES).join(", ")}`);
  console.error(`\nExamples:`);
  console.error(`  node sync.js backend`);
  console.error(`  node sync.js backend --exclude backend/mongodb`);
  console.error(`  node sync.js common --include backend/architecture`);
  process.exit(1);
}

async function copyRuleFiles(rules: RuleMetadata[], rulesOutput: string): Promise<void> {
  await Promise.all(
    rules.map(async (rule) => {
      const destination = path.join(rulesOutput, rule.relativePath);
      await mkdir(path.dirname(destination), { recursive: true });
      await cp(path.join(PATHS.packageRoot, "rules", rule.relativePath), destination);
    }),
  );
}

async function appendOverlay(projectRoot: string): Promise<void> {
  const overlayPath = path.join(projectRoot, "OVERLAY.md");

  let overlayContent: string;
  try {
    overlayContent = await readFile(overlayPath, "utf8");
  } catch {
    return;
  }

  const agentsPath = path.join(projectRoot, FILES.agents);
  const currentContent = await readFile(agentsPath, "utf8");
  const updatedContent = `${currentContent}\n<!-- Source: ./OVERLAY.md -->\n\n${overlayContent}`;
  await writeFile(agentsPath, updatedContent, "utf8");

  console.log(`📎 Appended OVERLAY.md to ${FILES.agents}`);
}

const PRETTIER_CONFIG_FILES = [
  ".prettierrc",
  ".prettierrc.json",
  ".prettierrc.js",
  ".prettierrc.cjs",
  ".prettierrc.yaml",
  ".prettierrc.yml",
  "prettier.config.js",
  "prettier.config.cjs",
  "prettier.config.mjs",
] as const;

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function detectFormatter(projectRoot: string): Promise<"oxfmt" | "prettier" | undefined> {
  if (await fileExists(path.join(projectRoot, ".oxfmtrc.json"))) {
    return "oxfmt";
  }

  const prettierChecks = await Promise.all(
    PRETTIER_CONFIG_FILES.map(
      async (configFile) => await fileExists(path.join(projectRoot, configFile)),
    ),
  );
  if (prettierChecks.some(Boolean)) {
    return "prettier";
  }

  try {
    const packageJson = JSON.parse(
      await readFile(path.join(projectRoot, "package.json"), "utf8"),
    ) as { devDependencies?: Record<string, string> };
    const devDependencies = packageJson.devDependencies ?? {};

    if ("oxfmt" in devDependencies) {
      return "oxfmt";
    }

    if ("prettier" in devDependencies) {
      return "prettier";
    }
  } catch {
    // package.json not found or unreadable
  }

  return undefined;
}

interface FormatOutputFilesArguments {
  projectRoot: string;
}

async function formatOutputFiles(arguments_: FormatOutputFilesArguments): Promise<void> {
  const { projectRoot } = arguments_;
  const formatter = await detectFormatter(projectRoot);

  if (!formatter) {
    console.warn("⚠️ No formatter detected (oxfmt or prettier). Skipping formatting.");
    return;
  }

  const filesToFormat = [path.join(projectRoot, FILES.agents), path.join(projectRoot, ".rules")];

  const command =
    formatter === "oxfmt"
      ? ["npx", "oxfmt", ...filesToFormat]
      : ["npx", "prettier", "--write", ...filesToFormat];

  await execAndLog({
    command,
    timeout: 60_000,
    verbose: false,
  });
}

// eslint-disable-next-line unicorn/prefer-top-level-await
void sync();

/* eslint-enable unicorn/no-process-exit, n/no-process-exit */
