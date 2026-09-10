import { spawnSync } from "node:child_process";
import path from "node:path";

const packageRoot = path.resolve(import.meta.dirname, "..");
const workspaceRoot = path.resolve(packageRoot, "../..");
const fixtureRoot = path.join(packageRoot, "test/negative");
const configPath = path.join(fixtureRoot, "oxlint.config.json");
const oxlintBin = path.join(workspaceRoot, "node_modules/oxlint/bin/oxlint");
const expectedCodes = [
  "clipboard(enforce-ts-rest-in-controllers)",
  "clipboard(no-cross-contract-imports)",
  "clipboard(require-contract-fixture-construction)",
  "clipboard(require-contract-response-parse)",
  "clipboard(require-http-module-factory)",
  "clipboard(require-run-validators-with-upsert)",
  "clipboard(require-zod-import-in-contracts)",
];

const result = spawnSync(
  process.execPath,
  [
    oxlintBin,
    "--config",
    configPath,
    "--format",
    "json",
    path.join(fixtureRoot, "contract-package"),
  ],
  { encoding: "utf8", cwd: workspaceRoot },
);

if (result.error) {
  throw result.error;
}

if (result.status !== 1) {
  throw new Error(
    `Expected negative fixtures to fail lint with status 1, received ${String(result.status)}.\n${result.stderr}`,
  );
}

/** @type {unknown} */
const report = JSON.parse(result.stdout);

if (!isDiagnosticReport(report)) {
  throw new TypeError(`Oxlint returned an unexpected JSON report.\n${result.stdout}`);
}

const actualCodes = new Set(report.diagnostics.map((diagnostic) => diagnostic.code));
const missingCodes = expectedCodes.filter((code) => !actualCodes.has(code));

if (missingCodes.length > 0) {
  throw new Error(
    `Negative fixtures did not report the expected rules: ${missingCodes.join(", ")}\n${result.stdout}`,
  );
}

process.stdout.write(`Verified ${expectedCodes.length} custom-rule negative fixtures.\n`);

/**
 * @param {unknown} value
 * @returns {value is { diagnostics: Array<{ code: string }> }}
 */
function isDiagnosticReport(value) {
  return (
    typeof value === "object" &&
    value !== null &&
    "diagnostics" in value &&
    Array.isArray(value.diagnostics) &&
    value.diagnostics.every(
      (diagnostic) =>
        typeof diagnostic === "object" &&
        diagnostic !== null &&
        "code" in diagnostic &&
        typeof diagnostic.code === "string",
    )
  );
}
