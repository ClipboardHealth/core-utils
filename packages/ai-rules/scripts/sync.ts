/* eslint-disable unicorn/no-process-exit */
/* eslint-disable n/no-process-exit */
import { cp } from "node:fs/promises";
import { join } from "node:path";

import { type ProfileName, PROFILES } from "./constants";
import { toErrorMessage } from "./toErrorMessage";

const PATHS = {
  projectRoot: join(__dirname, "../../../.."),
  rules: join(__dirname, ".."),
};

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

async function sync() {
  try {
    const profile = getProfileFromArguments();

    // Force copy files; rely on `git` if it overwrites files.
    await cp(join(PATHS.rules, profile), PATHS.projectRoot, { recursive: true, force: true });
    console.log(`✅ @clipboard-health/ai-rules synced ${profile}`);
  } catch (error) {
    // Log error but exit gracefully to avoid breaking installs
    console.error(`⚠️ @clipboard-health/ai-rules sync failed: ${toErrorMessage(error)}`);
    process.exit(0);
  }
}

// eslint-disable-next-line unicorn/prefer-top-level-await
void sync();

/* eslint-enable n/no-process-exit */
/* eslint-enable unicorn/no-process-exit */
