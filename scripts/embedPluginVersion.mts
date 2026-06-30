/**
 * Syncs the plugins/core version from its package.json into the plugin
 * manifest and skill sentinels.
 *
 * `plugins/core/package.json` is the source of truth that `nx release` bumps
 * (it is private, so it is never published to npm). This script propagates
 * that version to:
 *
 *   - `plugins/core/.claude-plugin/plugin.json` — the manifest Claude Code
 *     reads at runtime.
 *   - `core@<major>.<minor>.<patch>` sentinels in the babysit-pr and
 *     commit-push-pr skills, so PR comments stay traceable to the plugin
 *     version that produced them. Substituting here (rather than reading a
 *     manifest at runtime) keeps the skills agent-agnostic: Codex, Claude
 *     Code, and any other host see the same literal string without resolving
 *     a Claude-specific manifest path.
 *
 * Idempotent: re-running with no version change rewrites nothing.
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

// import.meta.dirname is undefined when tsx imports this module as CommonJS
// (scripts/release.ts pulls it in via tsx); deriving the directory from
// import.meta.url works under both native ESM (node) and tsx.
// oxlint-disable-next-line unicorn/prefer-import-meta-properties
const REPO_ROOT = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "..");
const PACKAGE_JSON = path.join(REPO_ROOT, "plugins/core/package.json");
const PLUGIN_JSON = path.join(REPO_ROOT, "plugins/core/.claude-plugin/plugin.json");
const SKILLS_ROOT = path.join(REPO_ROOT, "plugins/core/skills");
const SENTINEL_PATTERN = /core@\d+\.\d+\.\d+/g;
const MANIFEST_VERSION_PATTERN = /("version":\s*")\d+\.\d+\.\d+(")/;
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

export function syncPluginVersion(): { version: string; changedFiles: string[] } {
  const { version } = JSON.parse(readFileSync(PACKAGE_JSON, "utf8")) as { version: unknown };
  if (typeof version !== "string" || !SEMVER_PATTERN.test(version)) {
    throw new TypeError(`Invalid version in ${PACKAGE_JSON}: ${String(version)}`);
  }

  const changedFiles: string[] = [];

  const manifest = readFileSync(PLUGIN_JSON, "utf8");
  const updatedManifest = manifest.replace(MANIFEST_VERSION_PATTERN, `$1${version}$2`);
  if (updatedManifest !== manifest) {
    writeFileSync(PLUGIN_JSON, updatedManifest);
    changedFiles.push(PLUGIN_JSON);
  }

  const target = `core@${version}`;
  for (const file of walk(SKILLS_ROOT)) {
    const content = readFileSync(file, "utf8");
    if (!content.includes("core@")) {
      continue;
    }
    const replaced = content.replaceAll(SENTINEL_PATTERN, target);
    if (replaced !== content) {
      writeFileSync(file, replaced);
      changedFiles.push(file);
    }
  }

  return { version, changedFiles };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { version, changedFiles } = syncPluginVersion();
  console.log(`✓ Synced core@${version} into ${changedFiles.length} file(s)`);
}
