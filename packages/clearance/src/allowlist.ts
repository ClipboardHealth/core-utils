import { readFileSync } from "node:fs";
import { delimiter as PATH_DELIMITER } from "node:path";

import { normalizeRule, parseList } from "./hostRule.ts";

const COMMENT_PREFIX = "#";

export interface ResolveAllowlistInput {
  env: NodeJS.ProcessEnv;
  readFile?: (path: string) => string;
}

export function resolveAllowlist(input: ResolveAllowlistInput): readonly string[] {
  const readFile = input.readFile ?? defaultReadFile;
  const fromEnv = parseList(input.env["CLEARANCE_ALLOW_HOSTS"]);
  const fromFiles = parseFilesEnv(input.env["CLEARANCE_ALLOW_HOSTS_FILES"]).flatMap((path) =>
    readHostsFile({ path, readFile }),
  );
  const normalized = [...fromEnv, ...fromFiles]
    .map(normalizeRule)
    .filter((rule): rule is string => rule !== undefined);

  if (normalized.length === 0) {
    throw new Error(
      "Set CLEARANCE_ALLOW_HOSTS or CLEARANCE_ALLOW_HOSTS_FILES, e.g. CLEARANCE_ALLOW_HOSTS=api.example.com",
    );
  }

  return [...new Set(normalized)];
}

function parseFilesEnv(value: string | undefined): string[] {
  if (value === undefined) {
    return [];
  }

  return value
    .split(PATH_DELIMITER)
    .map((path) => path.trim())
    .filter((path) => path.length > 0);
}

interface ReadHostsFileInput {
  path: string;
  readFile: (path: string) => string;
}

function readHostsFile(input: ReadHostsFileInput): string[] {
  let content: string;
  try {
    content = input.readFile(input.path);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Failed to read CLEARANCE_ALLOW_HOSTS_FILES path ${JSON.stringify(input.path)}: ${message}`,
      { cause: error },
    );
  }

  const hosts: string[] = [];
  for (const rawLine of content.split("\n")) {
    const [beforeComment = ""] = rawLine.split(COMMENT_PREFIX, 1);
    const trimmed = beforeComment.trim();
    if (trimmed.length > 0) {
      hosts.push(trimmed);
    }
  }
  return hosts;
}

function defaultReadFile(path: string): string {
  return readFileSync(path, "utf8");
}
