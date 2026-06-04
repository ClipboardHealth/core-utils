import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { constants as osConstants } from "node:os";
import path from "node:path";

/**
 * Run a package source entrypoint by basename. Published packages run compiled
 * JavaScript; workspace source runs TypeScript with the source export condition.
 *
 * @param {string} packageRoot
 * @param {string} name
 */
export function runCliEntrypoint(packageRoot, name) {
  const compiledPath = path.join(packageRoot, "src", `${name}.js`);
  const hasCompiledEntrypoint = existsSync(compiledPath);
  const entrypointPath = hasCompiledEntrypoint
    ? compiledPath
    : path.join(packageRoot, "src", `${name}.ts`);
  const result = spawnSync(
    process.execPath,
    [
      ...(hasCompiledEntrypoint ? [] : ["--conditions", "@clipboard-health/source"]),
      entrypointPath,
      ...process.argv.slice(2),
    ],
    { stdio: "inherit" },
  );

  if (result.error !== undefined) {
    throw result.error;
  }

  if (result.signal !== null) {
    const signalNumber = osConstants.signals[result.signal];
    process.exitCode = signalNumber === undefined ? 1 : 128 + signalNumber;
    return;
  }

  process.exitCode = result.status ?? 1;
}
