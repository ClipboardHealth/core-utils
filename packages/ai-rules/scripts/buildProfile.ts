import { cp, mkdir } from "node:fs/promises";
import path from "node:path";

import { PATHS, type ProfileName } from "./constants";
import { toErrorMessage } from "./toErrorMessage";

const { packageRoot, outputDirectory } = PATHS;

/**
 * Builds a single profile by copying individual .md files from categories.
 * No Ruler, no combined files - just copy the source .md files.
 */
export async function buildProfile(params: {
  categories: readonly string[];
  profileName: ProfileName;
}): Promise<string[]> {
  const { categories, profileName } = params;
  const logs: string[] = [];

  logs.push(`📦 Building ${profileName} with ${categories.join(", ")}`);

  const sourceDirectory = path.join(packageRoot, ".ruler");
  const outputPath = path.join(outputDirectory, profileName);

  try {
    await mkdir(outputPath, { recursive: true });

    // Copy individual .md files from each category to output
    await Promise.all(
      categories.map(async (category) => {
        const categoryPath = path.join(sourceDirectory, category);
        logs.push(`  Copying ${category} .md files to ${profileName}/`);

        await cp(categoryPath, outputPath, {
          recursive: true,
          filter: (source) => {
            const basename = path.basename(source);
            // Only copy .md files and directories
            return basename.endsWith(".md") || !basename.includes(".");
          },
        });
      }),
    );

    return logs;
  } catch (error) {
    throw new Error(`Error building ${profileName}: ${toErrorMessage(error)}`);
  }
}
