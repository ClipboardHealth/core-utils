import { join } from "node:path";

import type { Embed } from "../types";
import { type ExampleMap, type TargetMap } from "./types";

export function processTargets(
  params: Readonly<{
    exampleMap: ExampleMap;
    cwd: string;
    targetMap: TargetMap;
  }>,
) {
  const { exampleMap, targetMap, cwd } = params;

  function absolutePath(path: string): string {
    return join(cwd, path);
  }

  const result: Embed[] = [];
  for (const [target, value] of targetMap.entries()) {
    const { content, examples } = value;
    const matches = matchAll({ content, exists: (example) => examples.has(absolutePath(example)) });
    if (matches.length === 0) {
      result.push({ code: "NO_MATCH", paths: { target, examples: [] } });
    } else {
      let updatedContent = content;
      for (const { fullMatch, language, indent, example } of matches) {
        const exampleContent = exampleMap.get(absolutePath(example))!;
        const replacement = `\`\`\`${language}\n${prefixLines({
          content: [`// ${example}`, ...exampleContent.content.split("\n"), `\`\`\``],
          indent,
        })}`;
        updatedContent = updatedContent.replaceAll(fullMatch, replacement);
      }

      const paths = { examples: matches.map((m) => absolutePath(m.example)), target };
      result.push(
        content === updatedContent
          ? { code: "NO_CHANGE", paths }
          : { code: "UPDATE", paths, updatedContent },
      );
    }
  }

  return result;
}

function matchAll(params: Readonly<{ content: string; exists: (path: string) => boolean }>) {
  const { content, exists } = params;
  return [...content.matchAll(/```(typescript|ts)\n(\s+)\*\s+\/\/\s(.+)\n[\S\s]+?```/g)]
    .map((match) => {
      const [fullMatch, language, indent, example] = match;
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

function prefixLines(params: Readonly<{ content: string[]; indent: string }>): string {
  const { content, indent } = params;
  return content
    .map((line) => {
      const trimmed = line.trim();
      return trimmed ? `${indent}* ${line}` : `${indent}*`;
    })
    .join("\n");
}

function isDefined<T>(value: T | undefined): value is T {
  return value !== null && value !== undefined;
}