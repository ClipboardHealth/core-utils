import { glob, readFile } from "node:fs/promises";
import { join } from "node:path";

import { type ExamplePath } from "../types";
import { type Example, type ExampleMap } from "./types";

const EXAMPLE_MARKER_PREFIX = "// ";

export async function createExampleMap(params: {
  globPattern: string;
  root: string;
}): Promise<ExampleMap> {
  const { globPattern, root } = params;
  const exampleMap = new Map<ExamplePath, Example>();

  for await (const p of glob(globPattern, { cwd: root })) {
    const path = join(root, p);
    const content = await readFile(path, "utf8");
    const [first, ...rest] = content.split("\n");
    if (first?.startsWith(EXAMPLE_MARKER_PREFIX)) {
      exampleMap.set(path, {
        content: rest.join("\n"),
        targets: first
          .replace(EXAMPLE_MARKER_PREFIX, "")
          .split(",")
          .map((t) => join(root, t.trim())),
      });
    }
  }

  return exampleMap;
}
