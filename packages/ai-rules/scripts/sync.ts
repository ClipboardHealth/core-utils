/* eslint-disable unicorn/no-process-exit, n/no-process-exit */
import { access, chmod, cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  CATEGORIES,
  FILES,
  type ProfileName,
  PROFILES,
  RULE_FILES,
  type RuleId,
  toRulePath,
} from "./constants";
import { execAndLog } from "./execAndLog";
import { toErrorMessage } from "./toErrorMessage";

const PATHS = {
  projectRoot: path.join(__dirname, "../../../.."),
  packageRoot: path.join(__dirname, ".."),
};

interface ParsedArguments {
  profile: ProfileName;
  extraIncludes: RuleId[];
  excludes: RuleId[];
}

async function sync() {
  try {
    const parsedArguments = parseArguments();
    const ruleIds = resolveRuleIds(parsedArguments);
    if (ruleIds.length === 0) {
      console.error("❌ Error: No rules remaining after excludes");
      process.exit(1);
    }

    const rulesOutput = path.join(PATHS.projectRoot, ".rules");
    const agentsOutput = path.join(PATHS.projectRoot, ".agents");
    const skillsOutput = path.join(agentsOutput, "skills");
    const libraryOutput = path.join(agentsOutput, "lib");
    await Promise.all([
      rm(rulesOutput, { recursive: true, force: true }),
      rm(skillsOutput, { recursive: true, force: true }),
      rm(libraryOutput, { recursive: true, force: true }),
    ]);
    const [, skillsCopied, libraryCopied] = await Promise.all([
      copyRuleFiles(ruleIds, rulesOutput),
      copySkillFiles(skillsOutput),
      copyLibraryFiles(libraryOutput),
      copySetupScript(),
      mergeSessionStartHook(),
    ]);

    const agentsContent = await generateAgentsIndex(ruleIds);
    await writeFile(path.join(PATHS.projectRoot, FILES.agents), agentsContent, "utf8");
    await writeFile(path.join(PATHS.projectRoot, FILES.claude), "@AGENTS.md\n", "utf8");

    console.log(
      `✅ @clipboard-health/ai-rules synced ${parsedArguments.profile} (${ruleIds.length} rules)`,
    );

    await appendOverlay(PATHS.projectRoot);
    await formatOutputFiles(PATHS.projectRoot, { skillsCopied, libCopied: libraryCopied });
  } catch (error) {
    // Log error but exit gracefully to avoid breaking installs
    console.error(`⚠️ @clipboard-health/ai-rules sync failed: ${toErrorMessage(error)}`);
    process.exit(0);
  }
}

function isRuleId(value: string): value is RuleId {
  return value in RULE_FILES;
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

  const extraIncludes: RuleId[] = [];
  const excludes: RuleId[] = [];
  let mode: "include" | "exclude" | undefined;

  for (const argument of processArguments.slice(1)) {
    if (argument === "--include") {
      mode = "include";
    } else if (argument === "--exclude") {
      mode = "exclude";
    } else if (!mode) {
      console.error(`❌ Error: Unexpected argument "${argument}"`);
      printUsageAndExit();
    } else if (!isRuleId(argument)) {
      console.error(`❌ Error: Unknown rule "${argument}"`);
      console.error(`Available rules: ${Object.keys(RULE_FILES).join(", ")}`);
      process.exit(1);
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

function resolveRuleIds(parsedArguments: ParsedArguments): RuleId[] {
  const { profile, extraIncludes, excludes } = parsedArguments;

  const profileRules = PROFILES[profile].include.flatMap((category) => [...CATEGORIES[category]]);
  const ruleSet = new Set<RuleId>([...profileRules, ...extraIncludes]);

  for (const ruleId of excludes) {
    ruleSet.delete(ruleId);
  }

  return [...ruleSet];
}

async function copyRuleFiles(ruleIds: RuleId[], rulesOutput: string): Promise<void> {
  await Promise.all(
    ruleIds.map(async (ruleId) => {
      const rulePath = toRulePath(ruleId);
      const destination = path.join(rulesOutput, rulePath);
      await mkdir(path.dirname(destination), { recursive: true });
      await cp(path.join(PATHS.packageRoot, "rules", rulePath), destination);
    }),
  );
}

async function copySkillFiles(skillsOutput: string): Promise<boolean> {
  const skillsSource = path.join(PATHS.packageRoot, "skills");

  try {
    await cp(skillsSource, skillsOutput, { recursive: true });
    console.log(`📋 Synced skills to .agents/skills/`);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

async function copyLibraryFiles(libraryOutput: string): Promise<boolean> {
  const librarySource = path.join(PATHS.packageRoot, "lib");

  try {
    await cp(librarySource, libraryOutput, { recursive: true });
    console.log(`📋 Synced lib to .agents/lib/`);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

async function copySetupScript(): Promise<void> {
  const source = path.join(PATHS.packageRoot, "scripts", "setup.sh");
  const claudeDirectory = path.join(PATHS.projectRoot, ".claude");
  const destination = path.join(claudeDirectory, "setup.sh");

  await mkdir(claudeDirectory, { recursive: true });
  await cp(source, destination);
  await chmod(destination, 0o755);

  console.log(`📋 Synced setup.sh to .claude/setup.sh`);
}

async function mergeSessionStartHook(): Promise<void> {
  const claudeDirectory = path.join(PATHS.projectRoot, ".claude");
  const settingsPath = path.join(claudeDirectory, "settings.json");

  await mkdir(claudeDirectory, { recursive: true });

  const expectedCommand = '"$CLAUDE_PROJECT_DIR"/.claude/setup.sh';
  const setupHook = {
    matcher: "startup",
    hooks: [{ type: "command" as const, command: expectedCommand }],
  };

  let settings: Record<string, unknown>;
  try {
    settings = JSON.parse(await readFile(settingsPath, "utf8")) as Record<string, unknown>;
  } catch {
    settings = {};
  }

  const hooks = (settings["hooks"] ?? {}) as Record<string, unknown>;
  const sessionStart = (hooks["SessionStart"] ?? []) as Array<Record<string, unknown>>;

  // Every command string this package has ever shipped, past and present.
  const knownCommands = new Set([expectedCommand, '"$CLAUDE_PROJECT_DIR"/scripts/setup.sh']);

  function isKnownCommand(h: Record<string, unknown>): boolean {
    return typeof h["command"] === "string" && knownCommands.has(h["command"]);
  }

  // Check current state: do we need to add, update, or skip?
  let hasStale = false;
  let currentCount = 0;
  for (const entry of sessionStart) {
    const entryHooks = (entry["hooks"] ?? []) as Array<Record<string, unknown>>;
    for (const h of entryHooks) {
      if (typeof h["command"] !== "string" || !knownCommands.has(h["command"])) {
        continue;
      }

      if (h["command"] === expectedCommand) {
        currentCount += 1;
      } else {
        hasStale = true;
      }
    }
  }

  // Already correct: one current hook, no stale ones to clean up.
  if (!hasStale && currentCount === 1) {
    return;
  }

  // Remove only our specific hook commands from each entry, preserving unrelated
  // commands that may share the same entry. Drop entries left with no hooks.
  const cleaned = sessionStart.flatMap((entry) => {
    const entryHooks = entry["hooks"] as Array<Record<string, unknown>> | undefined;
    if (!entryHooks?.some((h) => isKnownCommand(h))) {
      return [entry];
    }

    const remaining = entryHooks.filter((h) => !isKnownCommand(h));
    return remaining.length > 0 ? [{ ...entry, hooks: remaining }] : [];
  });

  const updatedSessionStart = [...cleaned, setupHook];
  const updatedHooks = { ...hooks, SessionStart: updatedSessionStart };
  const updatedSettings = { ...settings, hooks: updatedHooks };

  await writeFile(settingsPath, JSON.stringify(updatedSettings, undefined, 2) + "\n", "utf8");

  const action = hasStale || currentCount > 1 ? "Updated" : "Added";
  console.log(`📋 ${action} SessionStart hook in .claude/settings.json`);
}

async function extractHeading(filePath: string): Promise<string> {
  try {
    const content = await readFile(filePath, "utf8");
    const match = /^#\s+(.+)$/m.exec(content);
    return match?.[1] ?? path.basename(filePath, ".md");
  } catch {
    return path.basename(filePath, ".md");
  }
}

async function generateAgentsIndex(ruleIds: RuleId[]): Promise<string> {
  const rows = await Promise.all(
    ruleIds.map(async (ruleId) => {
      const rulePath = toRulePath(ruleId);
      const heading = await extractHeading(path.join(PATHS.packageRoot, "rules", rulePath));
      return `| ${heading} | .rules/${rulePath} | ${RULE_FILES[ruleId]} |`;
    }),
  );

  return [
    "<!-- Generated by @clipboard-health/ai-rules -->",
    "",
    "# Coding Rules",
    "",
    "IMPORTANT: You MUST read the relevant rule files below before writing or reviewing code.",
    "",
    "| Rule | File | When to Read |",
    "|------|------|-------------|",
    ...rows,
    "",
  ].join("\n");
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

interface FormatOptions {
  skillsCopied: boolean;
  libCopied: boolean;
}

async function formatOutputFiles(projectRoot: string, options: FormatOptions): Promise<void> {
  const formatter = await detectFormatter(projectRoot);

  if (!formatter) {
    console.warn("⚠️ No formatter detected (oxfmt or prettier). Skipping formatting.");
    return;
  }

  const filesToFormat = [path.join(projectRoot, FILES.agents), path.join(projectRoot, ".rules")];

  if (options.skillsCopied) {
    filesToFormat.push(path.join(projectRoot, ".agents", "skills"));
  }

  if (options.libCopied) {
    filesToFormat.push(path.join(projectRoot, ".agents", "lib"));
  }

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
