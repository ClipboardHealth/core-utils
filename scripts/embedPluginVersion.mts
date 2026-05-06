/**
 * Embeds the plugins/core version into skill source files.
 *
 * Sentinels emitted by the babysit-pr and commit-push-pr skills carry a
 * `core@X.Y.Z` suffix so PR comments are traceable to the plugin version
 * that produced them. Substituting at build time (rather than reading
 * plugin.json at runtime) keeps the skills agent-agnostic — Codex,
 * Claude Code, and any other host see the same literal string without
 * needing path resolution to a Claude-specific plugin.json location.
 *
 * Reads `version` from plugins/core/.claude-plugin/plugin.json and
 * rewrites every `core@<digits>.<digits>.<digits>` occurrence in
 * plugins/core/skills/**\/*.{md,sh} to match.
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const REPO_ROOT = path.resolve(import.meta.dirname, "..");
const PLUGIN_JSON = path.join(REPO_ROOT, "plugins/core/.claude-plugin/plugin.json");
const SKILLS_ROOT = path.join(REPO_ROOT, "plugins/core/skills");
const VERSION_PATTERN = /core@\d+\.\d+\.\d+/g;
const SEMVER_PATTERN = /^\d+\.\d+\.\d+$/;

function walk(directory: string): string[] {
  const result: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      result.push(...walk(full));
    } else if (entry.isFile() && (full.endsWith(".md") || full.endsWith(".sh"))) {
      result.push(full);
    }
  }
  return result;
}

const { version } = JSON.parse(readFileSync(PLUGIN_JSON, "utf8")) as { version: unknown };
if (typeof version !== "string" || !SEMVER_PATTERN.test(version)) {
  throw new TypeError(`Invalid version in ${PLUGIN_JSON}: ${String(version)}`);
}

const target = `core@${version}`;
let updated = 0;
for (const file of walk(SKILLS_ROOT)) {
  const content = readFileSync(file, "utf8");
  if (!content.includes("core@")) {
    continue;
  }
  const replaced = content.replaceAll(VERSION_PATTERN, target);
  if (replaced !== content) {
    writeFileSync(file, replaced);
    updated += 1;
  }
}

console.log(`✓ Embedded ${target} into ${updated} skill file(s)`);
