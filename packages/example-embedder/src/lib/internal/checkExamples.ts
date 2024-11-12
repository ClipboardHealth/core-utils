import { readFile } from "node:fs/promises";
import { relative } from "node:path";

import { findExampleMatches } from "./findExampleMatches";
import { type ExampleMap } from "./types";

interface CheckResult {
  targetPath: string;
  examplePath: string;
}

export async function checkExamples(examples: Record<string, ExampleMap>): Promise<CheckResult[]> {
  const targets = await Promise.all(
    Object.entries(examples).map(async ([targetPath, exampleMap]) => ({
      targetPath,
      exampleMap,
      content: await readFile(targetPath, "utf8"),
    })),
  );

  return targets.flatMap(({ targetPath, exampleMap, content }) => {
    const matches = findExampleMatches(content, targetPath);
    const map = Object.fromEntries(
      Object.entries(exampleMap).map(([path, content]) => [relative(process.cwd(), path), content]),
    );

    return matches
      .filter(
        ({ examplePath, code }) =>
          map[examplePath] && normalize(map[examplePath]) !== normalize(code),
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
