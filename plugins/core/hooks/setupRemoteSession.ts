#!/usr/bin/env node
/**
 * Hook: Setup remote Claude Code session
 * - Ensures gh CLI is installed when running in remote session
 * - Uses only Node.js native functions (zero external dependencies at runtime)
 */

import { createHash } from "node:crypto";
import { execSync, spawnSync } from "node:child_process";
import {
  chmodSync,
  copyFileSync,
  createReadStream,
  createWriteStream,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  unlinkSync,
} from "node:fs";
import { get as httpsGet } from "node:https";
import { arch as osArch, homedir, platform as osPlatform, tmpdir as osTmpdir } from "node:os";
import { join } from "node:path";

const GITHUB_API_URL = "https://api.github.com/repos/cli/cli/releases/latest";
const LOCAL_BIN_DIR = join(homedir(), ".local", "bin");
const REQUEST_TIMEOUT_MS = 30_000;
const MAX_REDIRECTS = 5;

interface HookOutput {
  hookSpecificOutput: {
    additionalContext: string;
    hookEventName: string;
  };
}

interface GithubRelease {
  assets: ReadonlyArray<{
    browser_download_url: string;
    name: string;
  }>;
  tag_name: string;
}

interface PlatformInfo {
  arch: string;
  platform: string;
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

function isRemoteSession(): boolean {
  return process.env["CLAUDE_CODE_REMOTE"] === "true";
}

function isGhInstalled(): boolean {
  const result = spawnSync("gh", ["--version"], {
    encoding: "utf8",
    shell: true,
    stdio: "pipe",
  });
  return result.status === 0;
}

function isGhCallable(binPath: string): boolean {
  const ghPath = join(binPath, "gh");
  if (!existsSync(ghPath)) {
    return false;
  }
  const result = spawnSync(ghPath, ["--version"], {
    encoding: "utf8",
    stdio: "pipe",
  });
  return result.status === 0;
}

function getPlatformInfo(): PlatformInfo | undefined {
  const platform = osPlatform();
  const arch = osArch();

  const platformMap: Record<string, string> = {
    darwin: "macOS",
    linux: "linux",
  };

  const archMap: Record<string, string> = {
    arm64: "arm64",
    x64: "amd64",
  };

  const mappedPlatform = platformMap[platform];
  const mappedArch = archMap[arch];

  if (!mappedPlatform || !mappedArch) {
    return undefined;
  }

  return { arch: mappedArch, platform: mappedPlatform };
}

async function fetchText(url: string, redirectCount = 0): Promise<string> {
  return await new Promise((resolve, reject) => {
    const request = httpsGet(
      url,
      { headers: { "User-Agent": "claude-code-remote-setup" } },
      (response) => {
        if (response.statusCode === 302 || response.statusCode === 301) {
          const redirectUrl = response.headers.location;
          if (redirectUrl) {
            if (redirectCount >= MAX_REDIRECTS) {
              response.resume();
              reject(new Error("Too many redirects"));
              return;
            }
            response.resume();
            fetchText(redirectUrl, redirectCount + 1).then(resolve, reject);
            return;
          }
        }

        if (response.statusCode !== 200) {
          response.resume();
          reject(new Error(`HTTP ${response.statusCode ?? "unknown"}`));
          return;
        }

        let data = "";
        response.on("data", (chunk: Buffer) => {
          data += chunk.toString();
        });
        response.on("end", () => resolve(data));
        response.on("error", reject);
      },
    );
    request.setTimeout(REQUEST_TIMEOUT_MS, () => {
      request.destroy(new Error("Request timeout"));
    });
    request.on("error", reject);
  });
}

async function downloadFile(url: string, destination: string, redirectCount = 0): Promise<void> {
  return await new Promise((resolve, reject) => {
    const file = createWriteStream(destination);

    const handleError = (error: Error): void => {
      file.close();
      if (existsSync(destination)) {
        unlinkSync(destination);
      }
      reject(error);
    };

    file.on("error", handleError);

    const request = httpsGet(
      url,
      { headers: { "User-Agent": "claude-code-remote-setup" } },
      (response) => {
        if (response.statusCode === 302 || response.statusCode === 301) {
          const redirectUrl = response.headers.location;
          if (redirectUrl) {
            if (redirectCount >= MAX_REDIRECTS) {
              response.resume();
              file.close();
              handleError(new Error("Too many redirects"));
              return;
            }
            response.resume();
            file.close();
            downloadFile(redirectUrl, destination, redirectCount + 1).then(resolve, reject);
            return;
          }
        }

        if (response.statusCode !== 200) {
          file.close();
          handleError(new Error(`HTTP ${response.statusCode ?? "unknown"}`));
          return;
        }

        response.pipe(file);
        file.on("finish", () => {
          file.close();
          resolve();
        });
      },
    );
    request.setTimeout(REQUEST_TIMEOUT_MS, () => {
      request.destroy(new Error("Request timeout"));
    });
    request.on("error", handleError);
  });
}

async function computeFileSha256(filePath: string): Promise<string> {
  return await new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    const stream = createReadStream(filePath);
    stream.on("data", (chunk: Buffer | string) => hash.update(chunk));
    stream.on("end", () => resolve(hash.digest("hex")));
    stream.on("error", reject);
  });
}

function parseChecksumForAsset(checksumContent: string, assetName: string): string | undefined {
  for (const line of checksumContent.split("\n")) {
    const parts = line.trim().split(/\s+/);
    if (parts.length >= 2 && parts[1] === assetName) {
      return parts[0];
    }
  }
  return undefined;
}

async function installGh(): Promise<{ error?: string; success: boolean }> {
  const platformInfo = getPlatformInfo();
  if (!platformInfo) {
    return { error: `Unsupported platform: ${osPlatform()} ${osArch()}`, success: false };
  }

  let release: GithubRelease;
  try {
    const data = await fetchText(GITHUB_API_URL);
    release = JSON.parse(data) as GithubRelease;
  } catch (error) {
    return {
      error: `Failed to fetch gh release: ${error instanceof Error ? error.message : String(error)}`,
      success: false,
    };
  }

  const { arch, platform } = platformInfo;
  const assetName = `gh_${release.tag_name.replace("v", "")}_${platform}_${arch}.tar.gz`;
  const asset = release.assets.find((a) => a.name === assetName);

  if (!asset) {
    return { error: `No gh CLI asset found for ${platform} ${arch}`, success: false };
  }

  const checksumAsset = release.assets.find((a) => a.name === "checksums.txt");
  let expectedChecksum: string | undefined;

  if (checksumAsset) {
    try {
      const checksumContent = await fetchText(checksumAsset.browser_download_url);
      expectedChecksum = parseChecksumForAsset(checksumContent, assetName);
    } catch {
      // Continue without checksum verification
    }
  }

  mkdirSync(LOCAL_BIN_DIR, { recursive: true });
  const tempDir = mkdtempSync(join(osTmpdir(), "gh-install-"));
  const archivePath = join(tempDir, "gh.tar.gz");
  const extractDir = join(tempDir, "gh-extract");

  try {
    await downloadFile(asset.browser_download_url, archivePath);

    if (expectedChecksum) {
      const actualChecksum = await computeFileSha256(archivePath);
      if (actualChecksum !== expectedChecksum) {
        return {
          error: `Checksum mismatch: expected ${expectedChecksum}, got ${actualChecksum}`,
          success: false,
        };
      }
    }

    mkdirSync(extractDir, { recursive: true });
    execSync(`tar -xzf "${archivePath}" -C "${extractDir}"`, { stdio: "pipe" });

    const extractedDirs = readdirSync(extractDir);
    if (extractedDirs.length === 0) {
      return { error: "No files extracted from archive", success: false };
    }

    const ghBinPath = join(extractDir, extractedDirs[0] ?? "", "bin", "gh");
    const destPath = join(LOCAL_BIN_DIR, "gh");

    if (existsSync(destPath)) {
      unlinkSync(destPath);
    }

    copyFileSync(ghBinPath, destPath);
    chmodSync(destPath, 0o755);

    if (!isGhCallable(LOCAL_BIN_DIR)) {
      return { error: "gh CLI installed but not callable", success: false };
    }

    return { success: true };
  } catch (error) {
    return {
      error: `Installation failed: ${error instanceof Error ? error.message : String(error)}`,
      success: false,
    };
  } finally {
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  }
}

async function main(): Promise<void> {
  if (!isRemoteSession()) {
    return;
  }

  // Check if gh is already available
  if (isGhInstalled() || isGhCallable(LOCAL_BIN_DIR)) {
    return;
  }

  // Check for GITHUB_TOKEN before attempting install
  if (!process.env["GITHUB_TOKEN"]) {
    outputMessage(
      "Remote session detected but GITHUB_TOKEN is not set. The gh CLI requires GITHUB_TOKEN for authentication.",
    );
    return;
  }

  // Attempt to install gh CLI
  const result = await installGh();

  if (!result.success) {
    outputMessage(
      `Failed to install gh CLI: ${result.error}. Some GitHub operations may not work.`,
    );
    return;
  }

  outputMessage(
    `Installed gh CLI to ${LOCAL_BIN_DIR}. Make sure ${LOCAL_BIN_DIR} is in your PATH to use it.`,
  );
}

main().catch((error) => {
  console.error("Hook error:", error);
  process.exit(1);
});
