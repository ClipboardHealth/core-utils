/* eslint-disable security/detect-non-literal-fs-filename -- Tests require dynamic file system operations */
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

import { findAssetUrl, getPlatformInfo, isGhCallable, isGhInstalled } from "./ghInstall";
import { type GithubRelease } from "./types";

const TEST_BIN_DIR = path.join(homedir(), ".local", "test-bin");

describe("ghInstall", () => {
  describe("isGhInstalled", () => {
    it("should return a boolean", () => {
      const actual = isGhInstalled();

      expect(typeof actual).toBe("boolean");
    });
  });

  describe("isGhCallable", () => {
    afterEach(() => {
      if (existsSync(TEST_BIN_DIR)) {
        rmSync(TEST_BIN_DIR, { force: true, recursive: true });
      }
    });

    it("should return false when directory does not exist", () => {
      const actual = isGhCallable("/nonexistent/path");

      expect(actual).toBe(false);
    });

    it("should return false when gh binary does not exist in directory", () => {
      mkdirSync(TEST_BIN_DIR, { recursive: true });

      const actual = isGhCallable(TEST_BIN_DIR);

      expect(actual).toBe(false);
    });
  });

  describe("getPlatformInfo", () => {
    it("should return platform info or undefined", () => {
      const actual = getPlatformInfo();

      // On supported platforms, returns an object; on unsupported, returns undefined
      const isValidResult =
        actual === undefined ||
        (typeof actual.platform === "string" && typeof actual.arch === "string");

      expect(isValidResult).toBe(true);
    });
  });

  describe("findAssetUrl", () => {
    const mockRelease: GithubRelease = {
      tag_name: "v2.40.0",
      assets: [
        {
          name: "gh_2.40.0_linux_amd64.tar.gz",
          browser_download_url: "https://example.com/gh_2.40.0_linux_amd64.tar.gz",
        },
        {
          name: "gh_2.40.0_macOS_arm64.tar.gz",
          browser_download_url: "https://example.com/gh_2.40.0_macOS_arm64.tar.gz",
        },
      ],
    };

    it("should find matching asset for linux amd64", () => {
      const actual = findAssetUrl(mockRelease, { platform: "linux", arch: "amd64" });

      expect(actual).toBe("https://example.com/gh_2.40.0_linux_amd64.tar.gz");
    });

    it("should find matching asset for macOS arm64", () => {
      const actual = findAssetUrl(mockRelease, { platform: "macOS", arch: "arm64" });

      expect(actual).toBe("https://example.com/gh_2.40.0_macOS_arm64.tar.gz");
    });

    it("should return undefined when no matching asset found", () => {
      const actual = findAssetUrl(mockRelease, { platform: "windows", arch: "amd64" });

      expect(actual).toBeUndefined();
    });
  });
});
/* eslint-enable security/detect-non-literal-fs-filename */
