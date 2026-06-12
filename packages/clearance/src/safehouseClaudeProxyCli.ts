import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir, constants as osConstants } from "node:os";
import path from "node:path";

import {
  resolveSafehouseCmuxIntegration,
  safehouseCmuxIntegrationWarningLines,
} from "./safehouseCmux.ts";

const packageRoot = path.dirname(import.meta.dirname);
const shimDir = mkdtempSync(path.join(tmpdir(), "safehouse-claude-proxy-"));

try {
  const shimPath = path.join(shimDir, "claude");
  symlinkSync("/bin/sh", shimPath);

  const cmuxIntegration = resolveSafehouseCmuxIntegration();
  for (const warningLine of cmuxIntegration.isActive
    ? safehouseCmuxIntegrationWarningLines({
        commandName: "safehouse-claude-proxy",
        unreviewedEnvNames: cmuxIntegration.unreviewedEnvNames,
      })
    : []) {
    process.stderr.write(`${warningLine}\n`);
  }

  const safehouseArgs = cmuxIntegration.isActive
    ? [
        `--add-dirs-ro=${cmuxIntegration.addDirsReadOnly.join(":")}`,
        `--env-pass=${cmuxIntegration.envPass.join(",")}`,
      ]
    : [];
  const commandPrelude = cmuxIntegration.isActive
    ? `${cmuxIntegration.claudeCommandPrelude}; `
    : "";
  const result = spawnSync(
    path.join(packageRoot, "safehouse", "safehouse-clearance"),
    [
      ...safehouseArgs,
      shimPath,
      "-c",
      `${commandPrelude}exec claude --permission-mode auto "$@"`,
      "sh",
      ...process.argv.slice(2),
    ],
    { stdio: "inherit" },
  );

  if (result.error !== undefined) {
    throw result.error;
  }

  if (result.signal === null) {
    process.exitCode = result.status ?? 1;
  } else {
    const signalNumber = osConstants.signals[result.signal];
    process.exitCode = signalNumber === undefined ? 1 : 128 + signalNumber;
  }
} finally {
  rmSync(shimDir, { force: true, recursive: true });
}
