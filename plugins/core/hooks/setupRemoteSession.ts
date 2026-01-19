#!/usr/bin/env node
/**
 * Hook: Setup remote Claude Code session
 * Ensures gh CLI is installed when running in a remote session
 */

import { execSync, spawnSync } from "node:child_process";
import { chmodSync, copyFileSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { arch as osArch, homedir, platform as osPlatform, tmpdir } from "node:os";
import { join } from "node:path";

const GITHUB_API_URL = "https://api.github.com/repos/cli/cli/releases/latest";
const LOCAL_BIN_DIR = join(homedir(), ".local", "bin");

interface GithubRelease {
  assets: ReadonlyArray<{ browser_download_url: string; name: string }>;
  tag_name: string;
}

function outputMessage(message: string): void {
  console.log(
    JSON.stringify({
      hookSpecificOutput: { additionalContext: message, hookEventName: "SessionStart" },
    }),
  );
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

function getPlatformAssetName(tagName: string): string | undefined {
  const platformMap: Record<string, string> = { darwin: "macOS", linux: "linux" };
  const archMap: Record<string, string> = { arm64: "arm64", x64: "amd64" };

  const platform = platformMap[osPlatform()];
  const arch = archMap[osArch()];

  if (!platform || !arch) {
    return undefined;
  }

  return `gh_${tagName.replace("v", "")}_${platform}_${arch}.tar.gz`;
}

function curl(url: string): string {
  return execSync(`curl -fsSL -H "User-Agent: claude-code-hook" "${url}"`, {
    encoding: "utf8",
    timeout: 30_000,
  });
}

function installGh(): string | undefined {
  const assetName = getPlatformAssetName("");
  if (!assetName) {
    return `Unsupported platform: ${osPlatform()} ${osArch()}`;
  }

  let release: GithubRelease;
  try {
    release = JSON.parse(curl(GITHUB_API_URL)) as GithubRelease;
  } catch {
    return "Failed to fetch gh release info";
  }

  const fullAssetName = getPlatformAssetName(release.tag_name);
  const asset = release.assets.find((a) => a.name === fullAssetName);
  if (!asset) {
    return `No gh CLI asset found for this platform`;
  }

  const checksumAsset = release.assets.find((a) => a.name === "checksums.txt");
  let expectedChecksum: string | undefined;
  if (checksumAsset) {
    try {
      const checksums = curl(checksumAsset.browser_download_url);
      const match = checksums.split("\n").find((line) => line.includes(fullAssetName ?? ""));
      expectedChecksum = match?.split(/\s+/)[0];
    } catch {
      // Continue without checksum
    }
  }

  const tempDir = join(tmpdir(), `gh-install-${Date.now()}`);
  mkdirSync(tempDir, { recursive: true });

  try {
    const archivePath = join(tempDir, "gh.tar.gz");
    execSync(`curl -fsSL -o "${archivePath}" "${asset.browser_download_url}"`, { timeout: 60_000 });

    if (expectedChecksum) {
      const actual = execSync(`sha256sum "${archivePath}"`, { encoding: "utf8" }).split(/\s+/)[0];
      if (actual !== expectedChecksum) {
        return `Checksum mismatch`;
      }
    }

    execSync(`tar -xzf "${archivePath}" -C "${tempDir}"`, { stdio: "pipe" });

    const extractedDir = execSync(`ls "${tempDir}" | grep -v gh.tar.gz | head -1`, {
      encoding: "utf8",
    }).trim();
    const ghBinPath = join(tempDir, extractedDir, "bin", "gh");
    const destPath = join(LOCAL_BIN_DIR, "gh");

    mkdirSync(LOCAL_BIN_DIR, { recursive: true });
    if (existsSync(destPath)) {
      rmSync(destPath);
    }
    copyFileSync(ghBinPath, destPath);
    chmodSync(destPath, 0o755);

    if (spawnSync(destPath, ["--version"], { stdio: "pipe" }).status !== 0) {
      return "gh CLI installed but not callable";
    }

    return undefined;
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

function main(): void {
  if (process.env["CLAUDE_CODE_REMOTE"] !== "true") {
    return;
  }

  if (isGhAvailable()) {
    return;
  }

  if (!process.env["GITHUB_TOKEN"]) {
    outputMessage("Remote session detected but GITHUB_TOKEN is not set.");
    return;
  }

  const error = installGh();
  if (error) {
    outputMessage(`Failed to install gh CLI: ${error}`);
    return;
  }

  outputMessage(`Installed gh CLI to ${LOCAL_BIN_DIR}. Ensure it's in your PATH.`);
}

main();
