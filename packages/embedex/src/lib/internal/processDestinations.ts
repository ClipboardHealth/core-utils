import { extname, join } from "node:path";

import type { Embed } from "../types";
import { type Destination, type DestinationMap, type SourceMap } from "./types";

const CODE_FENCE_ID_BY_FILE_EXTENSION: Record<string, "" | "js" | "ts"> = {
  cjs: "js",
  cts: "ts",
  js: "js",
  jsx: "js",
  md: "",
  mdx: "",
  mjs: "js",
  mts: "ts",
  ts: "ts",
  tsx: "ts",
} as const;

export function processDestinations(
  params: Readonly<{
    cwd: string;
    sourceMap: Readonly<SourceMap>;
    destinationMap: Readonly<DestinationMap>;
  }>,
): Embed[] {
  const { cwd, destinationMap, sourceMap } = params;

  const result: Embed[] = [];
  for (const entry of destinationMap.entries()) {
    result.push(processDestination({ cwd, entry, sourceMap }));
  }

  return result;
}

function processDestination(params: {
  cwd: string;
  entry: [destination: string, value: Destination];
  sourceMap: Readonly<SourceMap>;
}): Embed {
  const { cwd, sourceMap, entry } = params;
  const [destination, { content, sources }] = entry;

  function absolutePath(path: string): string {
    return join(cwd, path);
  }

  const matches = matchAll({ content, exists: (source) => sources.has(absolutePath(source)) });
  if (matches.length === 0) {
    return { code: "NO_MATCH", paths: { destination, sources: [] } };
  }

  let updatedContent = content;
  for (const { fullMatch, prefix, sourcePath } of matches) {
    const { content } = sourceMap.get(absolutePath(sourcePath))!;
    updatedContent = updatedContent.replaceAll(
      fullMatch,
      createReplacement({ content, sourcePath, prefix }),
    );
  }

  const paths = { sources: matches.map((m) => absolutePath(m.sourcePath)), destination };
  return content === updatedContent
    ? { code: "NO_CHANGE", paths }
    : { code: "UPDATE", paths, updatedContent };
}

/**
 * A regex to match the embedex tag.
 *
 * Matching groups:
 * 1. The block's prefix
 * 2. The source file path
 */
const REGEX = /^(.*)<embedex source="(.+?)">\n[\S\s]*?<\/embedex>/gm;

function matchAll(
  params: Readonly<{
    content: string;
    exists: (path: string) => boolean;
  }>,
) {
  const { content, exists } = params;
  return [...content.matchAll(REGEX)]
    .map((match) => {
      const [fullMatch, prefix, sourcePath] = match;
      return isDefined(fullMatch) &&
        isDefined(prefix) &&
        isDefined(sourcePath) &&
        exists(sourcePath)
        ? { fullMatch, prefix, sourcePath }
        : undefined;
    })
    .filter(isDefined);
}

function createReplacement(
  params: Readonly<{ content: string; sourcePath: string; prefix: string }>,
) {
  const { content, sourcePath, prefix } = params;

  const contentHasCodeFence = content.includes("```");
  const backticks = contentHasCodeFence ? "````" : "```";
  const codeFenceId = CODE_FENCE_ID_BY_FILE_EXTENSION[extname(sourcePath).slice(1)];
  let processedContent = content.replaceAll("*/", "*\\/").trimEnd();

  // For markdown files, strip nested embedex tags to prevent recursive processing
  if (codeFenceId === "") {
    processedContent = processedContent
      .replaceAll(
        /^(.*)<embedex source=".+?">\n([\S\s]*?)<\/embedex>/gm,
        (_match, _prefix, content: string) => {
          const lines = content.split("\n");

          // Remove leading blank lines
          while (lines.length > 0 && lines[0]?.trim() === "") {
            lines.shift();
          }

          // Remove trailing blank lines
          while (lines.length > 0 && lines.at(-1)?.trim() === "") {
            lines.pop();
          }

          // Content already has correct indentation, don't prepend prefix
          return lines.join("\n");
        },
      )
      .trim();
  }

  const contentLines = processedContent.split("\n");
  const lines = [
    `<embedex source="${sourcePath}">`,
    "",
    ...(codeFenceId === ""
      ? contentLines
      : [`${backticks}${codeFenceId ?? ""}`, ...contentLines, backticks]),
    "",
    "</embedex>",
  ];

  return lines.map((line) => `${prefix}${line}`.trimEnd()).join("\n");
}

function isDefined<T>(value: T | undefined): value is T {
  return value !== null && value !== undefined;
}
