#!/usr/bin/env node
/**
 * Hook: Setup remote Claude Code session
 * Ensures gh CLI is installed when running in a remote session
 */

import { execSync, spawnSync } from "node:child_process";
import { chmodSync, copyFileSync, existsSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { arch as osArch, homedir, platform as osPlatform, tmpdir } from "node:os";
import { join } from "node:path";

const GITHUB_API_URL = "https://api.github.com/repos/cli/cli/releases/latest";
const LOCAL_BIN_DIR = join(homedir(), ".local", "bin");

const STATUS = {
  ghAvailable: "gh-available",
  installed: "installed",
  installFailed: "install-failed",
  notRemote: "not-remote",
  noToken: "no-token",
} as const;

type Status = (typeof STATUS)[keyof typeof STATUS];

interface HookOutput {
  hookSpecificOutput: {
    additionalContext: string;
    hookEventName: string;
  };
}

interface SetupResult {
  errorMessage?: string;
  status: Status;
}

interface GithubRelease {
  assets: ReadonlyArray<{ browser_download_url: string; name: string }>;
  tag_name: string;
}

function outputMessage(message: string): void {
  const output: HookOutput = {
    hookSpecificOutput: {
      additionalContext: message,
      hookEventName: "SessionStart",
    },
  };
  console.log(JSON.stringify(output));
}

function isGhAvailable(): boolean {
  const globalCheck = spawnSync("gh", ["--version"], { shell: true, stdio: "pipe" });
  if (globalCheck.status === 0) {
    return true;
  }
  const localPath = join(LOCAL_BIN_DIR, "gh");
  return (
    existsSync(localPath) && spawnSync(localPath, ["--version"], { stdio: "pipe" }).status === 0
  );
}

function getAssetName(tagName: string): string | undefined {
  const platforms: Record<string, string> = { darwin: "macOS", linux: "linux" };
  const arches: Record<string, string> = { arm64: "arm64", x64: "amd64" };
  const p = platforms[osPlatform()];
  const a = arches[osArch()];
  return p && a ? `gh_${tagName.replace("v", "")}_${p}_${a}.tar.gz` : undefined;
}

function exec(cmd: string, timeout = 30_000): string {
  return execSync(cmd, { encoding: "utf8", stdio: "pipe", timeout });
}

function installGh(): string | undefined {
  if (!getAssetName("")) {
    return `Unsupported platform: ${osPlatform()} ${osArch()}`;
  }

  let release: GithubRelease;
  try {
    release = JSON.parse(exec(`curl -fsSL "${GITHUB_API_URL}"`)) as GithubRelease;
  } catch {
    return "Failed to fetch gh release info";
  }

  const assetName = getAssetName(release.tag_name);
  const asset = release.assets.find((a) => a.name === assetName);
  if (!asset) {
    return "No gh CLI asset found for this platform";
  }

  const tempDir = join(tmpdir(), `gh-install-${Date.now()}`);
  const archivePath = join(tempDir, "gh.tar.gz");

  try {
    mkdirSync(tempDir, { recursive: true });
    exec(`curl -fsSL -o "${archivePath}" "${asset.browser_download_url}"`, 60_000);
    exec(`tar -xzf "${archivePath}" -C "${tempDir}"`);

    const extracted = readdirSync(tempDir).find((d) => d !== "gh.tar.gz");
    if (!extracted) {
      return "No files extracted from archive";
    }

    mkdirSync(LOCAL_BIN_DIR, { recursive: true });
    const destPath = join(LOCAL_BIN_DIR, "gh");
    if (existsSync(destPath)) {
      rmSync(destPath);
    }
    copyFileSync(join(tempDir, extracted, "bin", "gh"), destPath);
    chmodSync(destPath, 0o755);

    return spawnSync(destPath, ["--version"], { stdio: "pipe" }).status === 0
      ? undefined
      : "gh CLI installed but not callable";
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

function getSetupStatus(): SetupResult {
  if (process.env["CLAUDE_CODE_REMOTE"] !== "true") {
    return { status: STATUS.notRemote };
  }

  if (isGhAvailable()) {
    return { status: STATUS.ghAvailable };
  }

  if (!process.env["GITHUB_TOKEN"]) {
    return { status: STATUS.noToken };
  }

  const error = installGh();
  return error
    ? { errorMessage: error, status: STATUS.installFailed }
    : { status: STATUS.installed };
}

function getMessageForStatus(status: Status, errorMessage?: string): string | undefined {
  switch (status) {
    case STATUS.notRemote:
    case STATUS.ghAvailable: {
      return undefined;
    }
    case STATUS.noToken: {
      return "Remote session detected but GITHUB_TOKEN is not set.";
    }
    case STATUS.installed: {
      return `Installed gh CLI to ${LOCAL_BIN_DIR}. Ensure it's in your PATH.`;
    }
    case STATUS.installFailed: {
      return `Failed to install gh CLI: ${errorMessage}`;
    }
    default: {
      const _exhaustiveCheck: never = status;
      return _exhaustiveCheck;
    }
  }
}

function main(): void {
  const { errorMessage, status } = getSetupStatus();
  const message = getMessageForStatus(status, errorMessage);

  if (message) {
    outputMessage(message);
  }
}

main();
