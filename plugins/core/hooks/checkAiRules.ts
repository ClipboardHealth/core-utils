#!/usr/bin/env node
/**
 * Hook: Ensure @clipboard-health/ai-rules is installed and up to date
 * Uses only Node.js native functions (zero external dependencies at runtime)
 */

import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { addSessionContext, outputHookResponse } from "../lib/hooks.ts";

const PROJECT_DIR = process.env["CLAUDE_PROJECT_DIR"] ?? ".";
const PACKAGE_NAME = "@clipboard-health/ai-rules";
const README_URL =
  "https://raw.githubusercontent.com/ClipboardHealth/core-utils/main/packages/ai-rules/README.md";

const STATUS = {
  configured: "configured",
  error: "error",
  incomplete: "incomplete",
  notInNodeModules: "not-in-node-modules",
  notInstalled: "not-installed",
} as const;

type Status = (typeof STATUS)[keyof typeof STATUS];

interface PackageJson {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  scripts?: Record<string, string>;
}

interface InstallationResult {
  errorMessage?: string;
  status: Status;
}

function outputMessage(message: string): void {
  outputHookResponse(addSessionContext(message));
}

function parsePackageJson(pkgPath: string): InstallationResult | PackageJson {
  try {
    return JSON.parse(readFileSync(pkgPath, "utf8")) as PackageJson;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error reading file";
    return {
      errorMessage: `Could not read or parse package.json: ${message}. Please fix the file and try again.`,
      status: STATUS.error,
    };
  }
}

function isInstallationResult(
  value: InstallationResult | PackageJson,
): value is InstallationResult {
  return "status" in value;
}

function getInstallationStatus(projectPath: string): InstallationResult {
  const pkgPath = join(projectPath, "package.json");
  const parseResult = parsePackageJson(pkgPath);

  if (isInstallationResult(parseResult)) {
    return parseResult;
  }

  const pkg = parseResult;
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };

  if (!deps[PACKAGE_NAME]) {
    return { status: STATUS.notInstalled };
  }

  const nodeModulesPath = join(projectPath, "node_modules", PACKAGE_NAME);
  if (!existsSync(nodeModulesPath)) {
    return { status: STATUS.notInNodeModules };
  }

  const scripts = pkg.scripts ?? {};
  const hasSyncScript = Object.hasOwn(scripts, "sync-ai-rules");
  const postinstallCallsSync = scripts["postinstall"]?.includes("sync-ai-rules") ?? false;
  const isFullyConfigured = hasSyncScript && postinstallCallsSync;

  return { status: isFullyConfigured ? STATUS.configured : STATUS.incomplete };
}

function getMessageForStatus(status: Status, errorMessage?: string): string | undefined {
  switch (status) {
    case STATUS.configured: {
      return undefined;
    }
    case STATUS.error: {
      return errorMessage ?? "Unknown error";
    }
    case STATUS.notInstalled: {
      return `${PACKAGE_NAME} is not installed. Ask the user if they'd like to install it. If approved, fetch ${README_URL} and follow the instructions. Ask the user: "Which profile to use (common, frontend, backend, datamodeling)? You can also use --include/--exclude to fine-tune individual rules. See ${README_URL} for details."`;
    }
    case STATUS.notInNodeModules: {
      return `${PACKAGE_NAME} is listed in package.json but not installed in node_modules. Ask the user if they'd like to run their package manager's install command.`;
    }
    case STATUS.incomplete: {
      return `${PACKAGE_NAME} is installed but not fully configured (missing sync-ai-rules script or postinstall hook). Ask the user: "Would you like to configure it? Which profile to use (common, frontend, backend, datamodeling)? You can also use --include/--exclude to fine-tune individual rules. See ${README_URL} for details.". If approved, fetch ${README_URL} and follow the instructions to add the missing configuration.`;
    }
    default: {
      const _exhaustiveCheck: never = status;
      return _exhaustiveCheck;
    }
  }
}

function main(): void {
  const projectPath = resolve(PROJECT_DIR);
  const packageJsonPath = join(projectPath, "package.json");

  if (!existsSync(packageJsonPath)) {
    return;
  }

  const { errorMessage, status } = getInstallationStatus(projectPath);
  const message = getMessageForStatus(status, errorMessage);

  if (message) {
    outputMessage(message);
  }
}

main();
