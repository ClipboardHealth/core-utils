import path from "node:path";

import { lintPlaywrightProject, loadPlaywrightFlakeLinterConfig } from "../lib/projectLinter";

const DEFAULT_CONFIG_FILE_NAME = "playwright-flake-lint.config.mjs";

interface RunCliParams {
  arguments_: readonly string[];
  cwd: string;
  writeError: (output: string) => void;
}

export async function runCli({ arguments_, cwd, writeError }: RunCliParams): Promise<number> {
  const configFilePath = path.resolve(cwd, getConfigFilePath(arguments_));
  const config = await loadPlaywrightFlakeLinterConfig({ configFilePath });
  const violations = await lintPlaywrightProject({ config, cwd });

  for (const violation of violations) {
    writeError(
      `${violation.filePath}:${violation.line}:${violation.column} ` +
        `[${violation.ruleId}] ${violation.message}. ` +
        `For a justified exception, add // flake-lint-allow ` +
        `${violation.ruleId} -- <reason>.\n`,
    );
  }

  return violations.length === 0 ? 0 : 1;
}

function getConfigFilePath(arguments_: readonly string[]): string {
  if (arguments_.length === 0) {
    return DEFAULT_CONFIG_FILE_NAME;
  }

  if (arguments_.length === 2 && arguments_[0] === "--config" && arguments_[1] !== undefined) {
    return arguments_[1];
  }

  throw new Error("Usage: playwright-flake-lint [--config <config-file-path>]");
}
