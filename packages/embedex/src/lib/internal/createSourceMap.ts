import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { glob } from "glob";

import { type SourcePath } from "../types";
import { type Source, type SourceMap } from "./types";

const SOURCE_MARKER_PREFIX = "// embedex: ";

export async function createSourceMap(
  params: Readonly<{ cwd: string; sourcesGlob: string }>,
): Promise<SourceMap> {
  const { cwd, sourcesGlob } = params;
  const sourceMap = new Map<SourcePath, Source>();
  const paths = await glob(sourcesGlob, { absolute: true, cwd, nodir: true });

  for await (const path of paths) {
    const content = await readFile(path, "utf8");
    const [first, ...rest] = content.split("\n");
    if (first?.startsWith(SOURCE_MARKER_PREFIX)) {
      sourceMap.set(path, {
        content: rest.join("\n"),
        destinations: first
          .replace(SOURCE_MARKER_PREFIX, "")
          .split(",")
          .map((t) => join(cwd, t.trim())),
      });
    }
  }

  return sourceMap;
}
