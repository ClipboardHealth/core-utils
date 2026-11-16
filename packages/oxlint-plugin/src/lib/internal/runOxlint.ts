import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";

export interface OxlintDiagnostic {
  code?: string;
  filename: string;
  labels?: Array<{ span: { length: number; line: number; offset: number } }>;
  message: string;
}

/** Runs the repository's own Oxlint, so its version and configuration discovery apply. */
export function runOxlint(params: { args: readonly string[]; cwd: string }): {
  diagnostics: OxlintDiagnostic[];
} {
  const { args, cwd } = params;
  const result = spawnSync(process.execPath, [resolveOxlintBin({ cwd }), ...args], {
    cwd,
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024,
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0 && result.status !== 1) {
    throw new Error(
      `oxlint exited with status ${String(result.status)}.\n${result.stderr}${result.stdout}`,
    );
  }

  const report = JSON.parse(result.stdout) as { diagnostics: OxlintDiagnostic[] };
  return { diagnostics: report.diagnostics };
}

/** Runs `oxlint --print-config` in the repository and returns its resolved `ignorePatterns`. */
export function readIgnorePatterns(params: { cwd: string }): { ignorePatterns: string[] } {
  const { cwd } = params;
  const result = spawnSync(process.execPath, [resolveOxlintBin({ cwd }), "--print-config"], {
    cwd,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });

  if (result.status !== 0) {
    return { ignorePatterns: [] };
  }

  const config = JSON.parse(result.stdout) as { ignorePatterns?: string[] };
  return { ignorePatterns: config.ignorePatterns ?? [] };
}

function resolveOxlintBin(params: { cwd: string }): string {
  const requireFromCwd = createRequire(path.join(params.cwd, "package.json"));
  let packageJson: string;
  try {
    packageJson = requireFromCwd.resolve("oxlint/package.json");
  } catch {
    throw new Error(
      `Install oxlint in ${params.cwd}; it is a peer of @clipboard-health/oxlint-config.`,
    );
  }

  return path.join(path.dirname(packageJson), "bin/oxlint");
}
