import { existsSync, realpathSync } from "node:fs";
import path from "node:path";

import { git } from "./changedLines";

/** The configuration files Oxlint discovers in its working directory. */
const OXLINT_CONFIG_FILES = [
  ".oxlintrc.json",
  ".oxlintrc.jsonc",
  "oxlint.config.ts",
  "oxlint.config.mts",
];

/**
 * The directory to lint from: the nearest one from `cwd` up to the Git top level that holds an
 * Oxlint configuration, else the top level. In a monorepo whose packages each install Oxlint and
 * configure it, that is the invoking package, so Oxlint, its configuration and the changed files
 * all come from that package.
 */
export function resolveLintRoot(params: { cwd: string }): string {
  const topLevel = git({ args: ["rev-parse", "--show-toplevel"], cwd: params.cwd }).trim();
  // Real, because Git reports the top level's real path, such as macOS's /private/var for /var.
  let directory = realpathSync(params.cwd);
  while (directory !== topLevel && directory !== path.dirname(directory)) {
    const candidate = directory;
    if (OXLINT_CONFIG_FILES.some((file) => existsSync(path.join(candidate, file)))) {
      return directory;
    }

    directory = path.dirname(directory);
  }

  return topLevel;
}
