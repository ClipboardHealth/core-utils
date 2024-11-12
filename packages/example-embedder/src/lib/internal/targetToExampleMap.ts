import { readFile } from "node:fs/promises";

import { type ExampleMap } from "./types";

export async function targetToExampleMap(
  paths: readonly string[],
): Promise<Record<string, ExampleMap>> {
  const files = await Promise.all(
    paths.map(async (path) => ({ path, content: await readFile(path, "utf8") })),
  );

  return files.reduce<Record<string, ExampleMap>>((accumulator, file) => {
    const [firstLine, ...code] = file.content.split("\n");
    const targetPaths = firstLine?.match(/\/\/ @example\s+(.+)/)?.[1]?.split(",");

    if (!targetPaths) {
      return accumulator;
    }

    return targetPaths.reduce((intermediateResult, targetPath) => {
      const trimmedPath = targetPath.trim();
      return {
        ...intermediateResult,
        [trimmedPath]: {
          ...intermediateResult[trimmedPath],
          [file.path]: code.join("\n"),
        },
      };
    }, accumulator);
  }, {});
}
