import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { constants as osConstants } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

/**
 * Load a side-effecting entrypoint by basename. In published/built mode, dynamically
 * imports the compiled `${name}.js` in-process. In source/dev mode (no compiled output
 * present), spawns a child node that loads the `.ts` source with
 * `--conditions @clipboard-health/source` so cross-package bare imports of
 * `@clipboard-health/*` workspace deps also resolve to source.
 *
 * @param {string} packageRoot
 * @param {string} name
 */
export async function runCli(packageRoot, name) {
  const compiledPath = join(packageRoot, "src", `${name}.js`);
  if (existsSync(compiledPath)) {
    await import(pathToFileURL(compiledPath).href);
    return;
  }

  const sourcePath = join(packageRoot, "src", `${name}.ts`);
  const result = spawnSync(
    process.execPath,
    ["--conditions", "@clipboard-health/source", sourcePath, ...process.argv.slice(2)],
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
