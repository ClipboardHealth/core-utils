import { access, readFile } from "node:fs/promises";
import path from "node:path";

import { execAndLog } from "./execAndLog";

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

export async function detectFormatter(
  projectRoot: string,
): Promise<"oxfmt" | "prettier" | undefined> {
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

export async function runAvailableFormatter(
  projectRoot: string,
  filesToFormat: string[],
): Promise<void> {
  const formatter = await detectFormatter(projectRoot);

  if (!formatter) {
    console.warn("⚠️ No formatter detected (oxfmt or prettier). Skipping formatting.");
    return;
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
