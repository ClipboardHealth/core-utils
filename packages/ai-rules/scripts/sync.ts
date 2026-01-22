/* eslint-disable unicorn/no-process-exit, n/no-process-exit */
import { cp, readdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { type ProfileName, PROFILES } from "./constants";
import { toErrorMessage } from "./toErrorMessage";

const PATHS = {
  projectRoot: path.join(__dirname, "../../../.."),
  rules: path.join(__dirname, ".."),
};

async function sync() {
  try {
    const profile = getProfileFromArguments();

    // Copy all .md files from the built profile to .ai-rules
    const sourcePath = path.join(PATHS.rules, profile);
    const targetPath = path.join(PATHS.projectRoot, ".ai-rules", profile);

    await cp(sourcePath, targetPath, {
      force: true,
      recursive: true,
    });

    console.log(`✅ @clipboard-health/ai-rules synced ${profile} to .ai-rules/${profile}/`);

    // Create CLAUDE.md and AGENTS.md that reference the individual rule files
    await createRuleFiles({ profile, projectRoot: PATHS.projectRoot });
  } catch (error) {
    // Log error but exit gracefully to avoid breaking installs
    console.error(`⚠️ @clipboard-health/ai-rules sync failed: ${toErrorMessage(error)}`);
    process.exit(0);
  }
}

function getProfileFromArguments(): ProfileName {
  const profile = process.argv[2];

  if (!profile || !(profile in PROFILES)) {
    console.error("❌ Error: Invalid profile argument");
    console.error(`Usage: npm run sync <profile>`);
    console.error(`Available profiles: ${Object.keys(PROFILES).join(", ")}`);
    process.exit(1);
  }

  return profile as ProfileName;
}

/**
 * Creates CLAUDE.md and AGENTS.md that reference individual rule files for progressive disclosure.
 * Dynamically generates file list based on what exists in .ai-rules/{profile}/
 */
async function createRuleFiles(params: {
  profile: ProfileName;
  projectRoot: string;
}): Promise<void> {
  const { profile, projectRoot } = params;

  // Read the .ai-rules/{profile}/ directory to get all .md files
  const rulesDirectory = path.join(projectRoot, ".ai-rules", profile);
  const files = await readdir(rulesDirectory);
  const mdFiles = files.filter((file) => file.endsWith(".md")).sort();

  // Generate file list
  const fileList =
    mdFiles.length > 0
      ? mdFiles.map((file) => `- \`.ai-rules/${profile}/${file}\``).join("\n")
      : "No rule files found.";

  const content = `# AI Development Guidelines

This project uses AI-assisted development with the following rule structure:

## Core Rules (Load on Demand)

Universal patterns from @clipboard-health/ai-rules:

${fileList}

## Repo-Specific Instructions

For commands, reference implementations, and repo-specific configuration:

@OVERLAY.md
`;

  // Create both CLAUDE.md (for Claude Code) and AGENTS.md (for Cursor)
  const claudePath = path.join(projectRoot, "CLAUDE.md");
  const agentsPath = path.join(projectRoot, "AGENTS.md");

  await Promise.all([
    writeFile(claudePath, content, "utf8"),
    writeFile(agentsPath, content, "utf8"),
  ]);

  console.log(`📝 Created CLAUDE.md and AGENTS.md with references to .ai-rules/${profile}/`);
}

// eslint-disable-next-line unicorn/prefer-top-level-await
void sync();

/* eslint-enable unicorn/no-process-exit, n/no-process-exit */
