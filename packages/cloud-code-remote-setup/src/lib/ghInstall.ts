/* eslint-disable security/detect-non-literal-fs-filename -- This module requires dynamic file system operations to install CLI tools */
import { execSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
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
import path from "node:path";

import { either } from "@clipboard-health/util-ts";

import { createError, type GithubRelease, type PlatformInfo, type SetupResult } from "./types";

const GITHUB_API_URL = "https://api.github.com/repos/cli/cli/releases/latest";
const LOCAL_BIN_DIR = path.join(homedir(), ".local", "bin");
const REQUEST_TIMEOUT_MS = 15_000;
const MAX_REDIRECTS = 5;

export function isGhInstalled(): boolean {
  const result = spawnSync("gh", ["--version"], {
    encoding: "utf8",
    shell: true,
    stdio: "pipe",
  });
  return result.status === 0;
}

export function isGhCallable(binPath: string): boolean {
  const ghPath = path.join(binPath, "gh");
  if (!existsSync(ghPath)) {
    return false;
  }
  const result = spawnSync(ghPath, ["--version"], {
    encoding: "utf8",
    stdio: "pipe",
  });
  return result.status === 0;
}

export function getPlatformInfo(): PlatformInfo | undefined {
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

export function findAssetUrl(
  release: GithubRelease,
  platformInfo: PlatformInfo,
): string | undefined {
  const { arch, platform } = platformInfo;
  const pattern = `gh_${release.tag_name.replace("v", "")}_${platform}_${arch}.tar.gz`;

  const asset = release.assets.find((a) => a.name === pattern);
  return asset?.browser_download_url;
}

function findChecksumUrl(release: GithubRelease): string | undefined {
  const asset = release.assets.find((a) => a.name === "checksums.txt");
  return asset?.browser_download_url;
}

function getExpectedAssetName(release: GithubRelease, platformInfo: PlatformInfo): string {
  const { arch, platform } = platformInfo;
  return `gh_${release.tag_name.replace("v", "")}_${platform}_${arch}.tar.gz`;
}

async function fetchText(url: string, redirectCount = 0): Promise<string> {
  return await new Promise((resolve, reject) => {
    const request = httpsGet(
      url,
      {
        headers: {
          "User-Agent": "cloud-code-remote-setup",
        },
      },
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
            // eslint-disable-next-line promise/prefer-await-to-then -- recursive call inside Promise executor
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
        response.on("end", () => {
          resolve(data);
        });
        response.on("error", reject);
      },
    );
    request.setTimeout(REQUEST_TIMEOUT_MS, () => {
      request.destroy(new Error("Request timeout"));
    });
    request.on("error", reject);
  });
}

async function fetchJson<T>(url: string, redirectCount = 0): Promise<T> {
  const data = await fetchText(url, redirectCount);
  return JSON.parse(data) as T;
}

async function computeFileSha256(filePath: string): Promise<string> {
  return await new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    const stream = createReadStream(filePath);
    stream.on("data", (chunk: Buffer | string) => {
      hash.update(chunk);
    });
    stream.on("end", () => {
      resolve(hash.digest("hex"));
    });
    stream.on("error", reject);
  });
}

function parseChecksumForAsset(checksumContent: string, assetName: string): string | undefined {
  const lines = checksumContent.split("\n");
  for (const line of lines) {
    const parts = line.trim().split(/\s+/);
    if (parts.length >= 2 && parts[1] === assetName) {
      return parts[0];
    }
  }
  return undefined;
}

function safeUnlink(filePath: string): void {
  if (existsSync(filePath)) {
    unlinkSync(filePath);
  }
}

async function downloadFile(url: string, destination: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const file = createWriteStream(destination);

    const handleFileError = (error: Error): void => {
      file.close();
      safeUnlink(destination);
      reject(error);
    };

    file.on("error", handleFileError);

    const makeRequest = (requestUrl: string, redirectCount = 0): void => {
      const request = httpsGet(
        requestUrl,
        {
          headers: {
            "User-Agent": "cloud-code-remote-setup",
          },
        },
        (response) => {
          if (response.statusCode === 302 || response.statusCode === 301) {
            const redirectUrl = response.headers.location;
            if (redirectUrl) {
              if (redirectCount >= MAX_REDIRECTS) {
                response.resume();
                file.close();
                safeUnlink(destination);
                reject(new Error("Too many redirects"));
                return;
              }
              response.resume();
              makeRequest(redirectUrl, redirectCount + 1);
              return;
            }
          }

          if (response.statusCode !== 200) {
            file.close();
            safeUnlink(destination);
            reject(new Error(`HTTP ${response.statusCode ?? "unknown"}`));
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
      request.on("error", handleFileError);
    };

    makeRequest(url);
  });
}

function extractTarGz(archivePath: string, destination: string): void {
  mkdirSync(destination, { recursive: true });
  execSync(`tar -xzf "${archivePath}" -C "${destination}"`, {
    stdio: "pipe",
  });
}

export async function installGh(): Promise<SetupResult> {
  const platformInfo = getPlatformInfo();
  if (!platformInfo) {
    return either.left(
      createError("UNSUPPORTED_PLATFORM", `Unsupported platform: ${osPlatform()} ${osArch()}`),
    );
  }

  let release: GithubRelease;
  try {
    release = await fetchJson<GithubRelease>(GITHUB_API_URL);
  } catch (error) {
    return either.left(
      createError(
        "FETCH_RELEASE_FAILED",
        `Failed to fetch latest release: ${error instanceof Error ? error.message : String(error)}`,
      ),
    );
  }

  const assetUrl = findAssetUrl(release, platformInfo);
  if (!assetUrl) {
    return either.left(
      createError(
        "ASSET_NOT_FOUND",
        `No compatible asset found for ${platformInfo.platform} ${platformInfo.arch}`,
      ),
    );
  }

  const checksumUrl = findChecksumUrl(release);
  let expectedChecksum: string | undefined;

  if (checksumUrl) {
    try {
      const checksumContent = await fetchText(checksumUrl);
      const assetName = getExpectedAssetName(release, platformInfo);
      expectedChecksum = parseChecksumForAsset(checksumContent, assetName);
    } catch {
      // Checksum fetch failed, continue without verification but log warning
    }
  }

  mkdirSync(LOCAL_BIN_DIR, { recursive: true });

  const temporaryDirectory = mkdtempSync(path.join(osTmpdir(), "gh-install-"));
  const archivePath = path.join(temporaryDirectory, "gh.tar.gz");
  const extractDirectory = path.join(temporaryDirectory, "gh-extract");

  try {
    await downloadFile(assetUrl, archivePath);

    if (expectedChecksum) {
      const actualChecksum = await computeFileSha256(archivePath);
      if (actualChecksum !== expectedChecksum) {
        return either.left(
          createError(
            "CHECKSUM_MISMATCH",
            `Downloaded file checksum mismatch: expected ${expectedChecksum}, got ${actualChecksum}`,
          ),
        );
      }
    }

    extractTarGz(archivePath, extractDirectory);

    const extractedDirectories = readdirSync(extractDirectory);
    if (extractedDirectories.length === 0) {
      return either.left(createError("EXTRACTION_FAILED", "No files extracted from archive"));
    }

    const ghDirectory = path.join(extractDirectory, extractedDirectories[0] ?? "");
    const ghBinPath = path.join(ghDirectory, "bin", "gh");
    const destinationPath = path.join(LOCAL_BIN_DIR, "gh");

    if (existsSync(destinationPath)) {
      unlinkSync(destinationPath);
    }

    copyFileSync(ghBinPath, destinationPath);
    chmodSync(destinationPath, 0o755);

    if (!isGhCallable(LOCAL_BIN_DIR)) {
      return either.left(
        createError("INSTALLATION_VERIFICATION_FAILED", "gh CLI was installed but is not callable"),
      );
    }

    return either.right({
      message: `Successfully installed gh CLI ${release.tag_name} to ${destinationPath}`,
    });
  } catch (error) {
    return either.left(
      createError(
        "INSTALLATION_FAILED",
        `Failed to install gh CLI: ${error instanceof Error ? error.message : String(error)}`,
      ),
    );
  } finally {
    if (existsSync(temporaryDirectory)) {
      rmSync(temporaryDirectory, { recursive: true, force: true });
    }
  }
}

export { LOCAL_BIN_DIR };
/* eslint-enable security/detect-non-literal-fs-filename */
