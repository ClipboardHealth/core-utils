/**
 * Syncs the plugins/core version from its package.json into the plugin
 * manifests and skill sentinels.
 *
 * `plugins/core/package.json` is the source of truth that `nx release` bumps
 * (it is private, so it is never published to npm).
 *
 * Idempotent: re-running with no version change rewrites nothing. Pass
 * `--check` to report drift without writing (exits non-zero when any file is
 * out of sync); `verify` runs it that way so managed files can't drift.
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
const PLUGIN_MANIFESTS = [
  path.join(REPO_ROOT, "plugins/core/.claude-plugin/plugin.json"),
  path.join(REPO_ROOT, "plugins/core/.codex-plugin/plugin.json"),
];
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
  managedFiles: string[];
} {
  const { check = false } = options;
  const version = options.version ?? readPackageJsonVersion();
  if (!SEMVER_PATTERN.test(version)) {
    throw new TypeError(`Invalid plugin version: ${JSON.stringify(version)}`);
  }

  const changedFiles: string[] = [];
  // Every file this sync owns, whether or not it changed this run. Callers stage
  // these so a version already written out-of-band (e.g. by the postinstall that
  // npm runs mid-release) still lands in the commit even when changedFiles is empty.
  const managedFiles: string[] = [...PLUGIN_MANIFESTS];

  for (const pluginManifest of PLUGIN_MANIFESTS) {
    const manifest = JSON.parse(readFileSync(pluginManifest, "utf8")) as { version?: string };
    if (manifest.version !== version) {
      if (!check) {
        manifest.version = version;
        writeFileSync(pluginManifest, `${JSON.stringify(manifest, null, 2)}\n`);
      }
      changedFiles.push(pluginManifest);
    }
  }

  const target = `core@${version}`;
  for (const file of walk(SKILLS_ROOT)) {
    const content = readFileSync(file, "utf8");
    if (!content.includes("core@")) {
      continue;
    }
    managedFiles.push(file);
    const replaced = content.replaceAll(SENTINEL_PATTERN, target);
    if (replaced !== content) {
      if (!check) {
        writeFileSync(file, replaced);
      }
      changedFiles.push(file);
    }
  }

  return { version, changedFiles, managedFiles };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
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
