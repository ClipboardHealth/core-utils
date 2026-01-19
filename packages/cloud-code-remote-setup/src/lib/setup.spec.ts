/* eslint-disable security/detect-non-literal-fs-filename -- Tests require dynamic file system operations */
import { mkdirSync } from "node:fs";

import { isGhCallable, isGhInstalled, LOCAL_BIN_DIR } from "./ghInstall";
import { isRemoteSession, setup } from "./setup";

const VALID_SUCCESS_MESSAGES = new Set([
  "gh CLI is already installed",
  "gh CLI is available in local bin directory",
]);

const KNOWN_ERROR_CODES = new Set([
  "UNSUPPORTED_PLATFORM",
  "FETCH_RELEASE_FAILED",
  "ASSET_NOT_FOUND",
  "CHECKSUM_MISMATCH",
  "EXTRACTION_FAILED",
  "INSTALLATION_FAILED",
  "INSTALLATION_VERIFICATION_FAILED",
  "MISSING_GITHUB_TOKEN",
]);

function isValidSuccessMessage(message: string): boolean {
  return VALID_SUCCESS_MESSAGES.has(message) || message.includes("Successfully installed gh CLI");
}

describe("setup", () => {
  describe("isRemoteSession", () => {
    const originalEnvironment = process.env["CLAUDE_CODE_REMOTE"];

    afterEach(() => {
      if (originalEnvironment === undefined) {
        delete process.env["CLAUDE_CODE_REMOTE"];
      } else {
        process.env["CLAUDE_CODE_REMOTE"] = originalEnvironment;
      }
    });

    it("should return true when CLAUDE_CODE_REMOTE is 'true'", () => {
      process.env["CLAUDE_CODE_REMOTE"] = "true";

      const actual = isRemoteSession();

      expect(actual).toBe(true);
    });

    it("should return false when CLAUDE_CODE_REMOTE is undefined", () => {
      delete process.env["CLAUDE_CODE_REMOTE"];

      const actual = isRemoteSession();

      expect(actual).toBe(false);
    });

    it("should return false when CLAUDE_CODE_REMOTE is 'false'", () => {
      process.env["CLAUDE_CODE_REMOTE"] = "false";

      const actual = isRemoteSession();

      expect(actual).toBe(false);
    });

    it("should return false when CLAUDE_CODE_REMOTE is empty string", () => {
      process.env["CLAUDE_CODE_REMOTE"] = "";

      const actual = isRemoteSession();

      expect(actual).toBe(false);
    });
  });

  describe("setup function", () => {
    const originalRemoteEnvironment = process.env["CLAUDE_CODE_REMOTE"];
    const originalGithubToken = process.env["GITHUB_TOKEN"];

    afterEach(() => {
      if (originalRemoteEnvironment === undefined) {
        delete process.env["CLAUDE_CODE_REMOTE"];
      } else {
        process.env["CLAUDE_CODE_REMOTE"] = originalRemoteEnvironment;
      }
      if (originalGithubToken === undefined) {
        delete process.env["GITHUB_TOKEN"];
      } else {
        process.env["GITHUB_TOKEN"] = originalGithubToken;
      }
    });

    it("should return success when not in a remote session", async () => {
      delete process.env["CLAUDE_CODE_REMOTE"];

      const actual = await setup();

      expect(actual.isRight).toBe(true);
      expect(actual.isRight && actual.right.message).toBe("Not a remote session, skipping setup");
    });

    it("should return success when CLAUDE_CODE_REMOTE is false", async () => {
      process.env["CLAUDE_CODE_REMOTE"] = "false";

      const actual = await setup();

      expect(actual.isRight).toBe(true);
      expect(actual.isRight && actual.right.message).toBe("Not a remote session, skipping setup");
    });

    it("should return error when GITHUB_TOKEN is missing and gh is not installed", async () => {
      process.env["CLAUDE_CODE_REMOTE"] = "true";
      delete process.env["GITHUB_TOKEN"];

      const actual = await setup();

      // If gh is already installed, it should succeed. Otherwise, it should fail with MISSING_GITHUB_TOKEN
      const isValidResult = actual.isRight
        ? isValidSuccessMessage(actual.right.message)
        : actual.left.code === "MISSING_GITHUB_TOKEN";

      expect(isValidResult).toBe(true);
    });

    it("should return a valid result in remote session with GITHUB_TOKEN", async () => {
      process.env["CLAUDE_CODE_REMOTE"] = "true";
      process.env["GITHUB_TOKEN"] = "test-token";

      const actual = await setup();

      // Result is either a success with valid message or a failure with known error code
      const isValidResult = actual.isRight
        ? isValidSuccessMessage(actual.right.message)
        : KNOWN_ERROR_CODES.has(actual.left.code);

      expect(isValidResult).toBe(true);
    }, 120_000);
  });
});

describe("integration: gh CLI availability", () => {
  const originalEnvironment = process.env["CLAUDE_CODE_REMOTE"];

  beforeAll(() => {
    mkdirSync(LOCAL_BIN_DIR, { recursive: true });
  });

  afterAll(() => {
    if (originalEnvironment === undefined) {
      delete process.env["CLAUDE_CODE_REMOTE"];
    } else {
      process.env["CLAUDE_CODE_REMOTE"] = originalEnvironment;
    }
  });

  it("should return a valid result after setup in remote session", async () => {
    process.env["CLAUDE_CODE_REMOTE"] = "true";

    const actual = await setup();

    // If successful, gh should be callable somewhere
    // If failed, it should have a valid error structure
    const isValidResult = actual.isRight
      ? isGhCallable(LOCAL_BIN_DIR) || isGhInstalled()
      : Boolean(actual.left.code) && Boolean(actual.left.message);

    expect(isValidResult).toBe(true);
  });
});
/* eslint-enable security/detect-non-literal-fs-filename */
