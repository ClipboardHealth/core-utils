/* eslint-disable unicorn/no-process-exit, n/no-process-exit */
import { cp, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { FILES, type ProfileName, PROFILES } from "./constants";
import { toErrorMessage } from "./toErrorMessage";

const PATHS = {
  projectRoot: path.join(__dirname, "../../../.."),
  rules: path.join(__dirname, ".."),
};

async function sync() {
  try {
    const profile = getProfileFromArguments();

    // Force copy files; rely on `git` if it overwrites files.
    await cp(path.join(PATHS.rules, profile), PATHS.projectRoot, { force: true, recursive: true });
    console.log(`✅ @clipboard-health/ai-rules synced ${profile}`);

    // Append OVERLAY.md content if it exists
    await appendOverlayToFiles({
      filesToUpdate: [FILES.agents],
      projectRoot: PATHS.projectRoot,
    });
  } catch (error) {
    // Log error but exit gracefully to avoid breaking installs
    console.error(`⚠️ @clipboard-health/ai-rules sync failed: ${toErrorMessage(error)}`);
    process.exit(0);
  }
}

function getProfileFromArguments(): ProfileName {
  const [_firstArgument, _secondArgument, profile] = process.argv;

  if (!profile || !(profile in PROFILES)) {
    console.error("❌ Error: Invalid profile argument");
    console.error(`Usage: npm run sync <profile>`);
    console.error(`Available profiles: ${Object.keys(PROFILES).join(", ")}`);
    process.exit(1);
  }

  return profile as ProfileName;
}

/**
 * Appends OVERLAY.md content to specified files if OVERLAY.md exists.
 */
async function appendOverlayToFiles(params: {
  filesToUpdate: string[];
  projectRoot: string;
}): Promise<void> {
  const { filesToUpdate, projectRoot } = params;
  const overlayPath = path.join(projectRoot, "OVERLAY.md");

  const overlayContent = await readOverlayContent(overlayPath);
  if (!overlayContent) {
    // OVERLAY.md doesn't exist or can't be read, nothing to append
    return;
  }

  // Append to each file
  await Promise.all(
    filesToUpdate.map(async (file) => {
      const filePath = path.join(projectRoot, file);

      try {
        const currentContent = await readFile(filePath, "utf8");
        const updatedContent = `${currentContent}\n<!-- Source: ./OVERLAY.md -->\n\n${overlayContent}`;
        await writeFile(filePath, updatedContent, "utf8");
      } catch (error) {
        console.warn(`⚠️ Could not append overlay to ${file}: ${toErrorMessage(error)}`);
      }
    }),
  );

  console.log(`📎 Appended OVERLAY.md to ${filesToUpdate.join(", ")}`);
}

async function readOverlayContent(overlayPath: string): Promise<string | undefined> {
  try {
    return await readFile(overlayPath, "utf8");
  } catch {
    return undefined;
  }
}

// eslint-disable-next-line unicorn/prefer-top-level-await
void sync();

/* eslint-enable unicorn/no-process-exit, n/no-process-exit */
