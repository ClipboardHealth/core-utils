import { readFile, writeFile } from "node:fs/promises";
import { extname, relative } from "node:path";

import { findExampleMatches } from "./findExampleMatches";
import type { ExampleMap } from "./types";

export async function embedExamples(targetPath: string, exampleMap: ExampleMap): Promise<void> {
  const content = await readFile(targetPath, "utf8");
  const matches = findExampleMatches(content, targetPath);
  const isMarkdown = extname(targetPath) === ".md";
  const normalize = isMarkdown ? normalizeMarkdown : normalizeTypescript;
  const relativeExampleMap = Object.fromEntries(
    Object.entries(exampleMap).map(([path, content]) => [relative(process.cwd(), path), content]),
  );

  let updatedContent = content;
  for (const { prefix, examplePath } of matches) {
    const exampleCode = relativeExampleMap[examplePath];
    if (exampleCode) {
      const normalizedCode = normalize(exampleCode);
      const codeBlock = `\`\`\`typescript\n${normalizedCode}\n${isMarkdown ? "" : " * "}\`\`\``;
      // eslint-disable-next-line security/detect-non-literal-regexp
      const pattern = new RegExp(`${escapeRegExp(prefix)}\\s*\`\`\`typescript\\n[^]*?\`\`\``, "g");
      updatedContent = updatedContent.replace(pattern, `${prefix}${codeBlock}`);
    }
  }

  if (updatedContent !== content) {
    await writeFile(targetPath, updatedContent);
  }
}

function normalizeTypescript(code: string): string {
  return code
    .split("\n")
    .map((line) => {
      const trimmed = line.trim();
      return trimmed ? ` * ${trimmed}` : " *";
    })
    .join("\n");
}

function normalizeMarkdown(code: string): string {
  return code
    .split("\n")
    .map((line) => line.trim())
    .join("\n");
}

function escapeRegExp(string: string): string {
  return string.replaceAll(/[$()*+.?[\\\]^{|}]/g, "\\$&");
}
