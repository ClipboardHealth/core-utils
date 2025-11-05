import { execSync } from "node:child_process";
import { copyFile, cp, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { FILES, PATHS, type ProfileName } from "./constants";
import { toErrorMessage } from "./toErrorMessage";

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

  const sourceDirectory = path.join(packageRoot, ".ruler");
  const temporaryDirectory = await mkdtemp(path.join(tmpdir(), `ai-rules-${profileName}-`));
  const paths = {
    source: sourceDirectory,
    temporary: temporaryDirectory,
    temporaryRuler: path.join(temporaryDirectory, ".ruler"),
    output: path.join(outputDirectory, profileName),
    rulerConfig: path.join(sourceDirectory, "ruler.toml"),
  };

  try {
    // Create tmp .ruler directory with selected categories and ruler.toml
    await mkdir(paths.temporaryRuler, { recursive: true });
    await Promise.all(
      categories.map(async (category) => {
        const source = path.join(paths.source, category);
        await cp(source, path.join(paths.temporaryRuler, category), {
          recursive: true,
        });
      }),
    );
    await copyFile(paths.rulerConfig, path.join(paths.temporaryRuler, "ruler.toml"));

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

    // Copy AGENTS.md
    await copyFile(path.join(paths.temporary, FILES.agents), path.join(paths.output, FILES.agents));

    // Generate CLAUDE.md that sources AGENTS.md
    const claudeMdContent = "@AGENTS.md\n";
    await writeFile(path.join(paths.output, FILES.claude), claudeMdContent, "utf8");

    return logs;
  } catch (error) {
    throw new Error(`Error building ${profileName}: ${toErrorMessage(error)}`);
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}
