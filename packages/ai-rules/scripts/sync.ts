/* eslint-disable unicorn/no-process-exit */
/* eslint-disable n/no-process-exit */
import { cp } from "node:fs/promises";
import { join } from "node:path";

import { toErrorMessage } from "./toErrorMessage";

const projectRoot = join(__dirname, "../../..");
const AI_RULES_SOURCE = join(__dirname, "..");

async function sync() {
  try {
    // Force copy files; rely on `git` if it overwrites files.
    await cp(AI_RULES_SOURCE, projectRoot, { recursive: true, force: true });
    console.log("✅ @clipboard-health/ai-rules sync complete");
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
