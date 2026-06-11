/* eslint-disable unicorn/no-process-exit, n/no-process-exit */
import { access, chmod, cp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
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

type AgentDirectoryName = "skills" | "lib";
type AgentDirectorySyncResult = "missing" | "linked" | "copied";

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
    const agentsOutput = path.join(PATHS.projectRoot, ".agents");
    const skillsOutput = path.join(agentsOutput, "skills");
    const libraryOutput = path.join(agentsOutput, "lib");
    await Promise.all([
      rm(rulesOutput, { recursive: true, force: true }),
      rm(skillsOutput, { recursive: true, force: true }),
      rm(libraryOutput, { recursive: true, force: true }),
    ]);
    const [, skillsSyncResult, librarySyncResult] = await Promise.all([
      copyRuleFiles(rules, rulesOutput),
      syncAgentDirectory("skills", skillsOutput),
      syncAgentDirectory("lib", libraryOutput),
      copySetupScript(),
      mergeSessionStartHook(),
    ]);

    const agentsContent = generateAgentsIndex(rules);
    await writeFile(path.join(PATHS.projectRoot, FILES.agents), agentsContent, "utf8");
    await writeFile(path.join(PATHS.projectRoot, FILES.claude), "@AGENTS.md\n", "utf8");

    console.log(
      `✅ @clipboard-health/ai-rules synced ${parsedArguments.profile} (${rules.length} rules)`,
    );

    await appendOverlay(PATHS.projectRoot);
    await formatOutputFiles(PATHS.projectRoot, {
      skillsCopied: skillsSyncResult === "copied",
      libCopied: librarySyncResult === "copied",
    });
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

async function syncAgentDirectory(
  directoryName: AgentDirectoryName,
  destination: string,
): Promise<AgentDirectorySyncResult> {
  const source = await resolveAgentDirectorySource(directoryName);

  if (!source) {
    return "missing";
  }

  await mkdir(path.dirname(destination), { recursive: true });

  const relativeSource = path.relative(path.dirname(destination), source);
  try {
    await symlink(relativeSource, destination, "dir");
    console.log(`📋 Linked ${directoryName} to .agents/${directoryName}/`);
    return "linked";
  } catch (error) {
    console.warn(
      `⚠️ Could not symlink ${directoryName}; copying instead: ${toErrorMessage(error)}`,
    );
    await cp(source, destination, { recursive: true });
    console.log(`📋 Synced ${directoryName} to .agents/${directoryName}/`);
    return "copied";
  }
}

async function resolveAgentDirectorySource(
  directoryName: AgentDirectoryName,
): Promise<string | undefined> {
  const packageSource = path.join(PATHS.packageRoot, directoryName);
  const sourceTreeSource = path.join(PATHS.projectRoot, "plugins", "core", directoryName);

  // This repo runs the built sync script from dist/, but checked-in links should
  // target source assets rather than ignored build output.
  if (isSourceBuildPackage() && (await fileExists(sourceTreeSource))) {
    return sourceTreeSource;
  }

  if (await fileExists(packageSource)) {
    return packageSource;
  }

  return undefined;
}

function isSourceBuildPackage(): boolean {
  return path
    .normalize(PATHS.packageRoot)
    .endsWith(path.normalize(path.join("dist", "packages", "ai-rules")));
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
  const sessionStart = (hooks["SessionStart"] ?? []) as Record<string, unknown>[];

  // Every command string this package has ever shipped, past and present.
  const knownCommands = new Set([expectedCommand, '"$CLAUDE_PROJECT_DIR"/scripts/setup.sh']);

  function isKnownCommand(h: Record<string, unknown>): boolean {
    return typeof h["command"] === "string" && knownCommands.has(h["command"]);
  }

  // Check current state: do we need to add, update, or skip?
  let hasStale = false;
  let currentCount = 0;
  for (const entry of sessionStart) {
    const entryHooks = (entry["hooks"] ?? []) as Record<string, unknown>[];
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
    const entryHooks = entry["hooks"] as Record<string, unknown>[] | undefined;
    if (entryHooks?.some((h) => isKnownCommand(h)) !== true) {
      return [entry];
    }

    const remaining = entryHooks.filter((h) => !isKnownCommand(h));
    return remaining.length > 0 ? [{ ...entry, hooks: remaining }] : [];
  });

  const updatedSessionStart = [...cleaned, setupHook];
  const updatedHooks = { ...hooks, SessionStart: updatedSessionStart };
  const updatedSettings = { ...settings, hooks: updatedHooks };

  await writeFile(settingsPath, `${JSON.stringify(updatedSettings, undefined, 2)}\n`, "utf8");

  const action = hasStale || currentCount > 1 ? "Updated" : "Added";
  console.log(`📋 ${action} SessionStart hook in .claude/settings.json`);
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
