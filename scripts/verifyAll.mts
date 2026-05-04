import { exec } from "node:child_process";

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
  { cmd: "node --run ci:check", name: "ci:check" },
  {
    cmd: "./node_modules/.bin/nx run-many --configuration ci --parallel 8 --targets build,lint,test",
    name: "run-many",
  },
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
    await new Promise<void>((resolve, reject) => {
      exec(
        cmd,
        {
          maxBuffer: EXEC_MAX_BUFFER_BYTES,
          timeout: EXEC_TIMEOUT_MS,
        },
        (error, stdout, stderr) => {
          if (error) {
            const combined = `${stdout}${stderr}`.trim();
            reject(new Error(combined || error.message));
          } else {
            resolve();
          }
        },
      );
    });
    return { durationMs: performance.now() - start, name, ok: true, output: "" };
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

  if (failures.length === 0) {
    print("All checks passed.");
    return;
  }

  print(`\nFailed (${failures.length}):`);
  for (const failure of failures) {
    print(`\n  ✗ ${failure.name}`);
    if (failure.output.trim()) {
      const indented = failure.output
        .trim()
        .split("\n")
        .map((line) => `    ${line}`)
        .join("\n");
      print(indented);
    }
  }
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

await main();
