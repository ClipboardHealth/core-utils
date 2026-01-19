/* eslint-disable security/detect-non-literal-fs-filename -- This package requires dynamic file system operations to install CLI tools */
import { execSync, spawnSync } from "node:child_process";
import {
  chmodSync,
  createWriteStream,
  existsSync,
  mkdirSync,
  readdirSync,
  renameSync,
  rmSync,
  unlinkSync,
} from "node:fs";
import { get as httpsGet } from "node:https";
import { arch as osArch, homedir, platform as osPlatform } from "node:os";
import path from "node:path";

import { either } from "@clipboard-health/util-ts";

import { type SetupError, type SetupResult } from "./types";

const GITHUB_API_URL = "https://api.github.com/repos/cli/cli/releases/latest";
const LOCAL_BIN_DIR = path.join(homedir(), ".local", "bin");

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

interface GithubRelease {
  readonly tag_name: string;
  readonly assets: ReadonlyArray<{
    readonly name: string;
    readonly browser_download_url: string;
  }>;
}

async function fetchJson<T>(url: string): Promise<T> {
  return await new Promise((resolve, reject) => {
    httpsGet(
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
            // eslint-disable-next-line promise/prefer-await-to-then -- recursive call inside Promise executor
            fetchJson<T>(redirectUrl).then(resolve, reject);
            return;
          }
        }

        if (response.statusCode !== 200) {
          reject(new Error(`HTTP ${response.statusCode ?? "unknown"}`));
          return;
        }

        let data = "";
        response.on("data", (chunk: Buffer) => {
          data += chunk.toString();
        });
        response.on("end", () => {
          try {
            resolve(JSON.parse(data) as T);
          } catch (error) {
            reject(error);
          }
        });
        response.on("error", reject);
      },
    ).on("error", reject);
  });
}

async function downloadFile(url: string, destination: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const file = createWriteStream(destination);

    const makeRequest = (requestUrl: string): void => {
      httpsGet(
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
              makeRequest(redirectUrl);
              return;
            }
          }

          if (response.statusCode !== 200) {
            file.close();
            unlinkSync(destination);
            reject(new Error(`HTTP ${response.statusCode ?? "unknown"}`));
            return;
          }

          response.pipe(file);
          file.on("finish", () => {
            file.close();
            resolve();
          });
          file.on("error", (error) => {
            file.close();
            unlinkSync(destination);
            reject(error);
          });
        },
      ).on("error", (error) => {
        file.close();
        unlinkSync(destination);
        reject(error);
      });
    };

    makeRequest(url);
  });
}

function getPlatformInfo(): { platform: string; arch: string } | undefined {
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

function findAssetUrl(
  release: GithubRelease,
  platformInfo: { platform: string; arch: string },
): string | undefined {
  const { arch, platform } = platformInfo;
  const extension = "tar.gz";
  const pattern = `gh_${release.tag_name.replace("v", "")}_${platform}_${arch}.${extension}`;

  const asset = release.assets.find((a) => a.name === pattern);
  return asset?.browser_download_url;
}

function extractTarGz(archivePath: string, destination: string): void {
  mkdirSync(destination, { recursive: true });
  execSync(`tar -xzf "${archivePath}" -C "${destination}"`, {
    stdio: "pipe",
  });
}

function createError(code: string, message: string): SetupError {
  return { code, message };
}

async function installGh(): Promise<SetupResult> {
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

  mkdirSync(LOCAL_BIN_DIR, { recursive: true });

  const temporaryDirectory = path.join(homedir(), ".local", "tmp");
  mkdirSync(temporaryDirectory, { recursive: true });

  const archivePath = path.join(temporaryDirectory, "gh.tar.gz");
  const extractDirectory = path.join(temporaryDirectory, "gh-extract");

  try {
    await downloadFile(assetUrl, archivePath);

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

    renameSync(ghBinPath, destinationPath);
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
    if (existsSync(archivePath)) {
      unlinkSync(archivePath);
    }
    if (existsSync(extractDirectory)) {
      rmSync(extractDirectory, { recursive: true, force: true });
    }
  }
}

export async function setup(): Promise<SetupResult> {
  if (!isRemoteSession()) {
    return either.right({ message: "Not a remote session, skipping setup" });
  }

  if (isGhInstalled()) {
    return either.right({ message: "gh CLI is already installed" });
  }

  if (isGhCallable(LOCAL_BIN_DIR)) {
    return either.right({ message: "gh CLI is available in local bin directory" });
  }

  return await installGh();
}

export { isGhCallable, isGhInstalled, isRemoteSession, LOCAL_BIN_DIR };
/* eslint-enable security/detect-non-literal-fs-filename */
