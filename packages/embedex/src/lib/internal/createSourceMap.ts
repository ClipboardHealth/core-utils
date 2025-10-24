import { readFile } from "node:fs/promises";
import path from "node:path";

import { glob } from "glob";

import { type SourcePath } from "../types";
import { type Source, type SourceMap } from "./types";

export const SOURCE_MARKER_PREFIX = "// embedex: ";

/**
 * Strips the source marker line from content if it exists.
 * This is needed when a file that is both a source and destination gets updated.
 */
export function stripSourceMarker(content: string): string {
  const [first, ...rest] = content.split("\n");
  if (first?.startsWith(SOURCE_MARKER_PREFIX)) {
    return rest.join("\n");
  }

  return content;
}

export async function createSourceMap(
  params: Readonly<{ cwd: string; sourcesGlob: string }>,
): Promise<SourceMap> {
  const { cwd, sourcesGlob } = params;
  const sourceMap = new Map<SourcePath, Source>();
  const paths = await glob(sourcesGlob, { absolute: true, cwd, nodir: true });

  await Promise.all(
    paths.map(async (filePath) => {
      const content = await readFile(filePath, "utf8");
      const [first, ...rest] = content.split("\n");
      if (first?.startsWith(SOURCE_MARKER_PREFIX)) {
        sourceMap.set(filePath, {
          content: rest.join("\n"),
          destinations: first
            .replace(SOURCE_MARKER_PREFIX, "")
            .split(",")
            .filter((t) => t.length > 0)
            .map((t) => path.resolve(cwd, t.trim())),
        });
      }
    }),
  );

  return sourceMap;
}
