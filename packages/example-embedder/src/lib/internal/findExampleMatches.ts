import { extname } from "node:path";

const EXAMPLE_PATH = "examples\\/[^\\n]+";
const CODE_BLOCK = "(```typescript\\n([^`]*)```)";
const PATTERNS = {
  ts: new RegExp(`(@example\\s+(${EXAMPLE_PATH})\n\\s*\\*\\s*${CODE_BLOCK})`, "g"),
  md: new RegExp(`(@example\\s+(${EXAMPLE_PATH})\n\\s*${CODE_BLOCK})`, "g"),
} as const;

interface ExampleMatch {
  prefix: string;
  examplePath: string;
  code: string;
}

export function findExampleMatches(content: string, filePath: string): ExampleMatch[] {
  const matches: ExampleMatch[] = [];
  for (const match of content.matchAll(PATTERNS[extname(filePath) === ".md" ? "md" : "ts"])) {
    const [, prefix, examplePath, codeBlock, code] = match;
    if (prefix && examplePath && codeBlock && code) {
      matches.push({
        prefix: prefix.replace(codeBlock, ""),
        examplePath,
        code: code.trim(),
      });
    }
  }

  return matches;
}
