import { readFile } from "node:fs/promises";

import type { ExamplePath, TargetPath } from "../types";
import { type ExampleMap, type Target, type TargetMap } from "./types";

export async function createTargetMap(
  params: Readonly<{ exampleMap: Readonly<ExampleMap> }>,
): Promise<TargetMap> {
  const { exampleMap } = params;
  const targetMap = new Map<TargetPath, Target>();
  for (const [examplePath, example] of exampleMap.entries()) {
    for (const targetPath of example.targets) {
      const value = targetMap.get(targetPath) ?? {
        // eslint-disable-next-line no-await-in-loop
        content: await readFile(targetPath, "utf8"),
        examples: new Set<ExamplePath>(),
      };
      value.examples.add(examplePath);
      targetMap.set(targetPath, value);
    }
  }

  return targetMap;
}
