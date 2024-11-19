import { join } from "node:path";

import type { Embed } from "../types";
import {
  getFileExtension,
  isSupportedFileExtension,
  type SupportedFileExtension,
} from "./fileTypes";
import { type ExampleMap, type Target, type TargetMap } from "./types";

const TARGET_CONFIG = {
  typeDoc: {
    pattern: /(`{3,4})(typescript|ts)\n(\s+)\*\s+\/\/\s(.+)\n[\S\s]*?\1/g,
    prefix: "*",
  },
  markdown: {
    pattern: /(`{3,4})(typescript|ts)\n(\s*)\/\/\s(.+)\n[\S\s]*?\1/g,
    prefix: "",
  },
};

type TargetConfig = (typeof TARGET_CONFIG)[keyof typeof TARGET_CONFIG];

const CONFIG_BY_FILE_EXTENSION: Record<SupportedFileExtension, TargetConfig> = {
  cts: TARGET_CONFIG.typeDoc,
  md: TARGET_CONFIG.markdown,
  mdx: TARGET_CONFIG.markdown,
  mts: TARGET_CONFIG.typeDoc,
  ts: TARGET_CONFIG.typeDoc,
  tsx: TARGET_CONFIG.typeDoc,
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

  const fileExtension = getFileExtension(target);
  if (!isSupportedFileExtension(fileExtension)) {
    return { code: "UNSUPPORTED", paths: { target, examples: [] } };
  }

  const targetConfig = CONFIG_BY_FILE_EXTENSION[fileExtension];
  const matches = matchAll({
    content,
    exists: (example) => examples.has(absolutePath(example)),
    targetConfig,
  });
  if (matches.length === 0) {
    return { code: "NO_MATCH", paths: { target, examples: [] } };
  }

  let updatedContent = content;
  for (const { fullMatch, language, indent, example } of matches) {
    const exampleContent = exampleMap.get(absolutePath(example))!;
    // Escape code blocks
    const codeBlock = exampleContent.content.includes("```") ? "````" : "```";
    const replacement = `${codeBlock}${language}\n${prefixLines({
      content: [
        `// ${example}`,
        // Escape comment blocks
        ...exampleContent.content.replaceAll("*/", "*\\/").split("\n"),
        codeBlock,
      ],
      indent,
      prefix: targetConfig.prefix,
    })}`;
    updatedContent = updatedContent.replaceAll(fullMatch, replacement);
  }

  const paths = { examples: matches.map((m) => absolutePath(m.example)), target };
  return content === updatedContent
    ? { code: "NO_CHANGE", paths }
    : { code: "UPDATE", paths, updatedContent };
}

function matchAll(
  params: Readonly<{
    content: string;
    exists: (path: string) => boolean;
    targetConfig: TargetConfig;
  }>,
) {
  const { content, exists, targetConfig } = params;
  return [...content.matchAll(targetConfig.pattern)]
    .map((match) => {
      const [fullMatch, , language, indent, example] = match;
      return isDefined(fullMatch) &&
        isDefined(language) &&
        isDefined(indent) &&
        isDefined(example) &&
        exists(example)
        ? { fullMatch, language, indent, example }
        : undefined;
    })
    .filter(isDefined);
}

function prefixLines(
  params: Readonly<{ content: readonly string[]; indent: string; prefix: string }>,
): string {
  const { content, indent, prefix } = params;

  const blankLinePrefix = `${indent}${prefix}`;
  const linePrefix = prefix ? `${blankLinePrefix} ` : blankLinePrefix;

  return content
    .map((line) => {
      const trimmed = line.trim();
      return trimmed ? `${linePrefix}${line}` : blankLinePrefix;
    })
    .join("\n");
}

function isDefined<T>(value: T | undefined): value is T {
  return value !== null && value !== undefined;
}
