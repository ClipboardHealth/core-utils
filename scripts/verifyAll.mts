/// <reference types="node" />

import { exec, type ExecException } from "node:child_process";

const EXEC_TIMEOUT_MS = 10 * 60_000;
const EXEC_MAX_BUFFER_BYTES = 10 * 1024 * 1024;

interface CheckResult {
  name: string;
  ok: boolean;
  output: string;
  durationMs: number;
}

// These run a pre-push hook and should not modify files
const CHECKS = [
  { cmd: "node --run affected", name: "affected" },
  { cmd: "node --run architecture:check", name: "architecture:check" },
  { cmd: "node --run cspell -- .", name: "cspell" },
  { cmd: "node --run embed:check", name: "embed:check" },
  { cmd: "node --run format:check", name: "format:check" },
  { cmd: "node --run knip", name: "knip" },
  { cmd: "node --run lint", name: "lint" },
  { cmd: "node --run markdown:lint", name: "markdown:lint" },
  { cmd: "node --run syncpack:lint", name: "syncpack:lint" },
] as const;

async function main(): Promise<void> {
  const totalStart = performance.now();

  print("▶ Running in parallel");
  const results = await Promise.all(CHECKS.map(async ({ name, cmd }) => await runCheck(name, cmd)));

  for (const result of results) {
    const icon = result.ok ? "✓" : "✗";
    print(`  ${icon} ${result.name} (${formatDuration(result.durationMs)})`);
  }

  printSummary(results, totalStart);

  if (!results.every((result) => result.ok)) {
    process.exitCode = 1;
  }
}

async function runCheck(name: string, cmd: string): Promise<CheckResult> {
  const start = performance.now();
  try {
    const output = await new Promise<string>((resolve, reject) => {
      exec(
        cmd,
        {
          maxBuffer: EXEC_MAX_BUFFER_BYTES,
          timeout: EXEC_TIMEOUT_MS,
        },
        (error: ExecException | null, stdout: string, stderr: string) => {
          const combinedOutput = combineProcessOutput(stdout, stderr);

          if (error !== null) {
            reject(new Error(combinedOutput.length > 0 ? combinedOutput : error.message));
            return;
          }

          resolve(combinedOutput);
        },
      );
    });
    return { durationMs: performance.now() - start, name, ok: true, output };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { durationMs: performance.now() - start, name, ok: false, output: message };
  }
}

function printSummary(results: CheckResult[], totalStart: number): void {
  const failures = results.filter((result) => !result.ok);
  const totalMs = performance.now() - totalStart;

  print("\n─── Summary ───");
  print(`Total: ${formatDuration(totalMs)}`);

  const successesWithOutput = results.filter((result) => result.ok && hasOutput(result.output));

  if (failures.length === 0) {
    print("All checks passed.");
    printCheckOutputs(`Passed with output (${successesWithOutput.length}):`, successesWithOutput);
    return;
  }

  printCheckOutputs(`Failed (${failures.length}):`, failures);
  printCheckOutputs(`Passed with output (${successesWithOutput.length}):`, successesWithOutput);
}

function combineProcessOutput(stdout: string, stderr: string): string {
  return [stdout, stderr]
    .map((output) => output.trim())
    .filter((output) => output.length > 0)
    .join("\n");
}

function printCheckOutputs(title: string, results: CheckResult[]): void {
  if (results.length === 0) {
    return;
  }

  print(`\n${title}`);
  for (const result of results) {
    const icon = result.ok ? "✓" : "✗";
    print(`\n  ${icon} ${result.name}`);
    printIndentedOutput(result.output);
  }
}

function printIndentedOutput(output: string): void {
  if (!hasOutput(output)) {
    return;
  }

  const indented = output
    .trim()
    .split("\n")
    .map((line) => `    ${line}`)
    .join("\n");
  print(indented);
}

function hasOutput(output: string): boolean {
  return output.trim().length > 0;
}

function formatDuration(milliseconds: number): string {
  if (milliseconds >= 1000) {
    return `${(milliseconds / 1000).toFixed(1)}s`;
  }
  return `${Math.round(milliseconds)}ms`;
}

function print(message: string): void {
  process.stdout.write(`${message}\n`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
