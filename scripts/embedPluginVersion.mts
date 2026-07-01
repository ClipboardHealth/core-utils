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
 * Idempotent: re-running with no version change rewrites nothing. Pass
 * `--check` to report drift without writing (exits non-zero when any file is
 * out of sync); `verify` runs it that way so the three locations can't drift.
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

function readPackageJsonVersion(): string {
  const { version } = JSON.parse(readFileSync(PACKAGE_JSON, "utf8")) as { version: unknown };
  return typeof version === "string" ? version : String(version);
}

/**
 * Propagates a version into the plugin manifest and skill sentinels.
 *
 * Pass `version` to use an explicit version (the release flow passes the version
 * Nx just computed, so the sync does not depend on when Nx flushes package.json
 * to disk); omit it to read the current version from package.json (the CLI and
 * postinstall path). With `check`, computes what would change but writes nothing,
 * returning the would-be-changed files so callers can fail on drift.
 */
export function syncPluginVersion(options: { check?: boolean; version?: string } = {}): {
  version: string;
  changedFiles: string[];
} {
  const { check = false } = options;
  const version = options.version ?? readPackageJsonVersion();
  if (!SEMVER_PATTERN.test(version)) {
    throw new TypeError(`Invalid plugin version: ${JSON.stringify(version)}`);
  }

  const changedFiles: string[] = [];

  const manifest = JSON.parse(readFileSync(PLUGIN_JSON, "utf8")) as { version?: string };
  if (manifest.version !== version) {
    if (!check) {
      manifest.version = version;
      writeFileSync(PLUGIN_JSON, `${JSON.stringify(manifest, null, 2)}\n`);
    }
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
      if (!check) {
        writeFileSync(file, replaced);
      }
      changedFiles.push(file);
    }
  }

  return { version, changedFiles };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const check = process.argv.includes("--check");
  const { version, changedFiles } = syncPluginVersion({ check });
  if (check && changedFiles.length > 0) {
    const stale = changedFiles.map((file) => path.relative(REPO_ROOT, file)).join(", ");
    console.error(
      `✗ plugins/core version out of sync with package.json (core@${version}). Run \`node scripts/embedPluginVersion.mts\`. Stale: ${stale}`,
    );
    process.exit(1);
  }
  console.log(
    check
      ? `✓ plugins/core version in sync (core@${version})`
      : `✓ Synced core@${version} into ${changedFiles.length} file(s)`,
  );
}
