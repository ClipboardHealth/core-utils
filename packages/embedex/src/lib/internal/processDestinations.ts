import path from "node:path";

import type { Embed } from "../types";
import { stripSourceMarker } from "./createSourceMap";
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

/**
 * A regex to match the embedex tag.
 *
 * Matching groups:
 * 1. The block's prefix
 * 2. The source file path
 */
const REGEX = /^(.*)<embedex source="(.+?)">\r?\n[\S\s]*?<\/embedex>/gm;

export function processDestinations(
  params: Readonly<{
    cwd: string;
    sourceMap: Readonly<SourceMap>;
    destinationMap: Readonly<DestinationMap>;
    updatedContentMap?: ReadonlyMap<string, string>;
  }>,
): Embed[] {
  const { cwd, destinationMap, sourceMap, updatedContentMap } = params;

  const result: Embed[] = [];
  for (const entry of destinationMap.entries()) {
    const childParams: {
      cwd: string;
      entry: [string, Destination];
      sourceMap: Readonly<SourceMap>;
      updatedContentMap?: ReadonlyMap<string, string>;
    } = { cwd, entry, sourceMap };
    /* istanbul ignore else */
    if (updatedContentMap) {
      childParams.updatedContentMap = updatedContentMap;
    }

    result.push(processDestination(childParams));
  }

  return result;
}

// eslint-disable-next-line sonarjs/cognitive-complexity
function processDestination(params: {
  cwd: string;
  entry: [destination: string, value: Destination];
  sourceMap: Readonly<SourceMap>;
  updatedContentMap?: ReadonlyMap<string, string>;
}): Embed {
  const { cwd, sourceMap, entry, updatedContentMap } = params;
  const [destination, { content: originalContent, sources }] = entry;

  // Use updated content if available (from earlier processing in dependency order),
  // otherwise use the original content from disk
  // Strip source marker from updated content to ensure clean processing
  /* istanbul ignore next - defensive: destination typically not in updatedContentMap during processing */
  let content = updatedContentMap?.has(destination)
    ? stripSourceMarker(updatedContentMap.get(destination)!)
    : originalContent;

  // Normalize CRLF to LF to ensure consistent processing across platforms
  content = content.replaceAll("\r\n", "\n");

  function absolutePath(filePath: string): string {
    return path.resolve(cwd, filePath);
  }

  // First, check for invalid source references and collect referenced sources
  const allEmbedexTags = [...content.matchAll(REGEX)];
  const invalidSources: string[] = [];
  const referencedSources = new Set<string>();

  for (const match of allEmbedexTags) {
    const sourcePath = match[2];
    /* istanbul ignore next */
    if (sourcePath) {
      const absoluteSourcePath = absolutePath(sourcePath);
      if (sources.has(absoluteSourcePath)) {
        referencedSources.add(absoluteSourcePath);
      } else {
        invalidSources.push(absoluteSourcePath);
      }
    }
  }

  if (invalidSources.length > 0) {
    return {
      code: "INVALID_SOURCE",
      paths: { destination, sources: [] },
      invalidSources,
    };
  }

  // Check for unreferenced sources (sources that declare this destination but have no embedex tag)
  const unreferencedSources: string[] = [];
  for (const source of sources) {
    if (!referencedSources.has(source)) {
      unreferencedSources.push(source);
    }
  }

  if (unreferencedSources.length > 0) {
    return {
      code: "UNREFERENCED_SOURCE",
      paths: { destination, sources: [] },
      unreferencedSources,
    };
  }

  const matches = matchAll({ content, exists: (source) => sources.has(absolutePath(source)) });
  /* istanbul ignore next */
  if (matches.length === 0) {
    return { code: "NO_MATCH", paths: { destination, sources: [] } };
  }

  // Deduplicate matches to avoid replacing identical tags multiple times with replaceAll
  const uniqueMatches = [...new Map(matches.map((m) => [m.fullMatch, m])).values()];

  let updatedContent = content;
  for (const { fullMatch, prefix, sourcePath } of uniqueMatches) {
    const absoluteSourcePath = absolutePath(sourcePath);
    const sourceFromMap = sourceMap.get(absoluteSourcePath)!;

    // If the source is also a destination that was updated earlier, use its updated content
    // and strip the source marker line if present
    let sourceContent = updatedContentMap?.get(absoluteSourcePath) ?? sourceFromMap.content;
    if (updatedContentMap?.has(absoluteSourcePath)) {
      sourceContent = stripSourceMarker(sourceContent);
    }

    // Normalize CRLF to LF to ensure consistent processing
    sourceContent = sourceContent.replaceAll("\r\n", "\n");

    updatedContent = updatedContent.replaceAll(
      fullMatch,
      createReplacement({ content: sourceContent, sourcePath, prefix }),
    );
  }

  const paths = { sources: uniqueMatches.map((m) => absolutePath(m.sourcePath)), destination };
  return content === updatedContent
    ? { code: "NO_CHANGE", paths }
    : { code: "UPDATE", paths, updatedContent };
}

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
      /* istanbul ignore next */
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
  const codeFenceId = CODE_FENCE_ID_BY_FILE_EXTENSION[path.extname(sourcePath).slice(1)];

  // Only escape */ when embedding into comment blocks (e.g., JSDoc)
  // to prevent breaking the comment. Don't escape in Markdown.
  const isInCommentBlock = /^\s*\*/.test(prefix);
  let processedContent = content.trimEnd();
  if (isInCommentBlock) {
    processedContent = processedContent.replaceAll("*/", String.raw`*\/`);
  }

  // For markdown files, strip nested embedex tags to prevent recursive processing
  if (codeFenceId === "") {
    processedContent = processedContent
      .replaceAll(
        /^(.*)<embedex source=".+?">\r?\n([\S\s]*?)<\/embedex>/gm,
        (_match, _prefix, content: string) => {
          const lines = content.split(/\r?\n/);

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

  const contentLines = processedContent.split(/\r?\n/);
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
  // eslint-disable-next-line no-eq-null, eqeqeq
  return value != null;
}
