import { execSync } from "node:child_process";
import { copyFile, cp, mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { toErrorMessage } from "@clipboard-health/util-ts";

import { PATHS, type ProfileName } from "./constants";

const { packageRoot, outputDirectory } = PATHS;

/**
 * Builds a single profile by combining rule categories and running Ruler.
 */
export async function buildProfile(params: {
  categories: readonly string[];
  profileName: ProfileName;
  timeout: number;
  verbose: boolean;
}): Promise<string[]> {
  const { categories, profileName, timeout, verbose } = params;
  const logs: string[] = [];

  logs.push(`📦 Building ${profileName} with ${categories.join(", ")}`);

  const sourceDirectory = join(packageRoot, ".ruler");
  const temporaryDirectory = await mkdtemp(join(tmpdir(), `ai-rules-${profileName}-`));
  const paths = {
    source: sourceDirectory,
    temporary: temporaryDirectory,
    temporaryRuler: join(temporaryDirectory, ".ruler"),
    output: join(outputDirectory, profileName),
    rulerConfig: join(sourceDirectory, "ruler.toml"),
  };

  try {
    // Create tmp .ruler directory with selected categories and ruler.toml
    await mkdir(paths.temporaryRuler, { recursive: true });
    await Promise.all(
      categories.map(async (category) => {
        const source = join(paths.source, category);
        await cp(source, join(paths.temporaryRuler, category), {
          recursive: true,
        });
      }),
    );
    await copyFile(paths.rulerConfig, join(paths.temporaryRuler, "ruler.toml"));

    // Run Ruler in tmp to generate files
    const output = execSync("npx @intellectronica/ruler apply", {
      cwd: paths.temporary,
      stdio: "pipe",
      timeout,
      encoding: "utf8",
    });
    if (verbose && output) {
      logs.push(output.trim());
    }

    // Copy generated files to output
    await mkdir(paths.output, { recursive: true });
    await Promise.all(
      ["AGENTS.md", "CLAUDE.md"].map(async (file) => {
        await copyFile(join(paths.temporary, file), join(paths.output, file));
      }),
    );

    return logs;
  } catch (error) {
    throw new Error(`Error building ${profileName}: ${toErrorMessage(error)}`);
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}
