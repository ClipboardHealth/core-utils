import { extname, join } from "node:path";

import type { Embed } from "../types";
import { type ExampleMap, type Target, type TargetMap } from "./types";

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

export function processTargets(
  params: Readonly<{
    cwd: string;
    exampleMap: Readonly<ExampleMap>;
    targetMap: Readonly<TargetMap>;
  }>,
) {
  const { targetMap, ...rest } = params;

  const result: Embed[] = [];
  for (const entry of targetMap.entries()) {
    result.push(processTarget({ ...rest, entry }));
  }

  return result;
}

function processTarget(params: {
  cwd: string;
  entry: [target: string, value: Target];
  exampleMap: Readonly<ExampleMap>;
}): Embed {
  const { cwd, exampleMap, entry } = params;
  const [target, { content, examples }] = entry;

  function absolutePath(path: string): string {
    return join(cwd, path);
  }

  const matches = matchAll({ content, exists: (example) => examples.has(absolutePath(example)) });
  if (matches.length === 0) {
    return { code: "NO_MATCH", paths: { target, examples: [] } };
  }

  let updatedContent = content;
  for (const { fullMatch, prefix, examplePath } of matches) {
    const exampleContent = exampleMap.get(absolutePath(examplePath))!;
    updatedContent = updatedContent.replaceAll(
      fullMatch,
      buildReplacement2({ content: exampleContent.content, examplePath, prefix }),
    );
  }

  const paths = { examples: matches.map((m) => absolutePath(m.examplePath)), target };
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
      const [fullMatch, prefix, examplePath] = match;
      return isDefined(fullMatch) &&
        isDefined(prefix) &&
        isDefined(examplePath) &&
        exists(examplePath)
        ? { fullMatch, prefix, examplePath }
        : undefined;
    })
    .filter(isDefined);
}

function buildReplacement2(
  params: Readonly<{ content: string; examplePath: string; prefix: string }>,
) {
  const { content, examplePath, prefix } = params;

  const contentHasCodeFence = content.includes("```");
  const backticks = contentHasCodeFence ? "````" : "```";
  const codeFenceId = CODE_FENCE_ID_BY_FILE_EXTENSION[extname(examplePath).slice(1)];
  const escapedContent = content.replaceAll("*/", "*\\/").trimEnd().split("\n");
  const lines = [
    `<embedex source="${examplePath}">`,
    "",
    ...(codeFenceId === ""
      ? escapedContent
      : [`${backticks}${codeFenceId ?? ""}`, ...escapedContent, backticks]),
    "",
    "</embedex>",
  ];

  return lines.map((line) => `${prefix}${line}`.trimEnd()).join("\n");
}

function isDefined<T>(value: T | undefined): value is T {
  return value !== null && value !== undefined;
}
