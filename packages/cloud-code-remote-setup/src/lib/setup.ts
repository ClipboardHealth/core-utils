import { either } from "@clipboard-health/util-ts";

import { installGh, isGhCallable, isGhInstalled, LOCAL_BIN_DIR } from "./ghInstall";
import { createError, type SetupResult } from "./types";

export function isRemoteSession(): boolean {
  return process.env["CLAUDE_CODE_REMOTE"] === "true";
}

export async function setup(): Promise<SetupResult> {
  if (!isRemoteSession()) {
    return either.right({ message: "Not a remote session, skipping setup" });
  }

  if (isGhInstalled()) {
    return either.right({ message: "gh CLI is already installed" });
  }

  if (isGhCallable(LOCAL_BIN_DIR)) {
    return either.right({ message: "gh CLI is available in local bin directory" });
  }

  if (!process.env["GITHUB_TOKEN"]) {
    return either.left(
      createError("MISSING_GITHUB_TOKEN", "GITHUB_TOKEN is required to authenticate gh CLI"),
    );
  }

  return await installGh();
}
