import { readFile } from "node:fs/promises";

import type { TargetPath } from "../types";
import { type ExampleMap, type TargetMap } from "./types";

export async function createTargetMap(
  params: Readonly<{ exampleMap: Readonly<ExampleMap> }>,
): Promise<TargetMap> {
  const { exampleMap } = params;

  const uniqueTargetPaths = new Set([...exampleMap.values()].flatMap(({ targets }) => targets));
  const targetContents = new Map<TargetPath, string>();
  await Promise.all(
    [...uniqueTargetPaths].map(async (path) => {
      targetContents.set(path, await readFile(path, "utf8"));
    }),
  );

  return new Map(
    [...uniqueTargetPaths].map((targetPath) => [
      targetPath,
      {
        content: targetContents.get(targetPath)!,
        examples: new Set(
          [...exampleMap.entries()]
            .filter(([_, { targets }]) => targets.includes(targetPath))
            .map(([examplePath]) => examplePath),
        ),
      },
    ]),
  );
}
