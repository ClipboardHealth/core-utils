import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { glob } from "glob";

import { type ExamplePath } from "../types";
import { type Example, type ExampleMap } from "./types";

const EXAMPLE_MARKER_PREFIX = "// ";

export async function createExampleMap(params: {
  globPattern: string;
  cwd: string;
}): Promise<ExampleMap> {
  const { globPattern, cwd } = params;
  const exampleMap = new Map<ExamplePath, Example>();
  const paths = await glob(globPattern, { absolute: true, cwd, nodir: true });

  for await (const path of paths) {
    const content = await readFile(path, "utf8");
    const [first, ...rest] = content.split("\n");
    if (first?.startsWith(EXAMPLE_MARKER_PREFIX)) {
      exampleMap.set(path, {
        content: rest.join("\n"),
        targets: first
          .replace(EXAMPLE_MARKER_PREFIX, "")
          .split(",")
          .map((t) => join(cwd, t.trim())),
      });
    }
  }

  return exampleMap;
}
