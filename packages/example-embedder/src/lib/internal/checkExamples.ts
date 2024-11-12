import { readFile } from "node:fs/promises";
import { relative } from "node:path";

import { findExampleMatches } from "./findExampleMatches";
import { type ExampleMap } from "./types";

interface CheckResult {
  targetPath: string;
  examplePath: string;
}

export async function checkExamples(examples: Record<string, ExampleMap>): Promise<CheckResult[]> {
  const targetPaths = Object.entries(examples);
  const contents = await Promise.all(
    targetPaths.map(async ([targetPath]) => await readFile(targetPath, "utf8")),
  );

  return targetPaths.flatMap(([targetPath, exampleMap], index) => {
    const matches = findExampleMatches(contents[index]!, targetPath);
    const relativeExampleMap = Object.fromEntries(
      Object.entries(exampleMap).map(([path, content]) => [relative(process.cwd(), path), content]),
    );

    return matches
      .filter(
        ({ examplePath, code }) =>
          relativeExampleMap[examplePath] &&
          normalize(relativeExampleMap[examplePath]) !== normalize(code),
      )
      .map(({ examplePath }) => ({ targetPath, examplePath }));
  });
}

function normalize(code: string): string {
  return code
    .split("\n")
    .map((line) => line.trim())
    .map((line) => line.replace(/^\s*\*\s*/, ""))
    .filter(Boolean)
    .join(" ")
    .replaceAll(/\s+/g, " ")
    .replaceAll(/;$/g, "");
}
