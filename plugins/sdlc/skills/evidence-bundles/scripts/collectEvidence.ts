#!/usr/bin/env node
/**
 * collect-evidence.ts - Automated evidence collection for PRs
 *
 * Usage: npx tsx collectEvidence.ts [OPTIONS]
 *
 * Options:
 *   --tests       Collect test results
 *   --coverage    Collect coverage reports
 *   --logs        Collect recent logs
 *   --all         Collect all evidence types
 *   --output DIR  Output directory (default: ./evidence)
 *
 * Example:
 *   npx tsx collectEvidence.ts --all --output ./pr-evidence
 *
 * Uses only Node.js native functions (zero external dependencies at runtime).
 */

import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { basename, join } from "node:path";
import { spawn, spawnSync } from "node:child_process";

interface Options {
  collectCoverage: boolean;
  collectLogs: boolean;
  collectTests: boolean;
  outputDir: string;
}

function parseArgs(args: string[]): Options {
  const options: Options = {
    collectCoverage: false,
    collectLogs: false,
    collectTests: false,
    outputDir: "./evidence",
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === "--tests") {
      options.collectTests = true;
    } else if (arg === "--coverage") {
      options.collectCoverage = true;
    } else if (arg === "--logs") {
      options.collectLogs = true;
    } else if (arg === "--all") {
      options.collectTests = true;
      options.collectCoverage = true;
      options.collectLogs = true;
    } else if (arg === "--output") {
      const nextArg = args[i + 1];
      if (!nextArg || nextArg.startsWith("--")) {
        console.error("Error: --output requires a directory path");
        process.exit(1);
      }
      options.outputDir = nextArg;
      i++;
    } else {
      console.error(`Unknown option: ${arg}`);
      process.exit(1);
    }
  }

  return options;
}

function ensureDir(dir: string): void {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

function runCommand(command: string, args: string[]): Promise<string> {
  return new Promise((resolve) => {
    const proc = spawn(command, args, {
      shell: true,
      stdio: ["inherit", "pipe", "pipe"],
    });

    let output = "";

    proc.stdout?.on("data", (data: Buffer) => {
      const text = data.toString();
      output += text;
      process.stdout.write(text);
    });

    proc.stderr?.on("data", (data: Buffer) => {
      const text = data.toString();
      output += text;
      process.stderr.write(text);
    });

    proc.on("close", () => {
      resolve(output);
    });

    proc.on("error", () => {
      resolve(output || "Command failed to execute");
    });
  });
}

function hasTestScript(): boolean {
  if (!existsSync("package.json")) {
    return false;
  }
  try {
    const pkg = JSON.parse(readFileSync("package.json", "utf8")) as {
      scripts?: Record<string, string>;
    };
    return Boolean(pkg.scripts?.["test"]);
  } catch {
    return false;
  }
}

function commandExists(cmd: string): boolean {
  const result = spawnSync("command", ["-v", cmd], {
    shell: true,
    stdio: "ignore",
  });
  return result.status === 0;
}

async function collectTests(outputDir: string): Promise<void> {
  console.log("Collecting test results...");

  let output: string;

  if (hasTestScript()) {
    output = await runCommand("npm", ["test"]);
  } else if (commandExists("nx")) {
    output = await runCommand("nx", ["run-many", "--target=test"]);
  } else {
    output = "No test runner found";
  }

  writeFileSync(join(outputDir, "test-results.txt"), output);
  console.log("✓ Test results saved");
}

function collectCoverage(outputDir: string): void {
  console.log("Collecting coverage...");

  const coverageDir = "coverage";
  const outputCoverageDir = join(outputDir, "coverage");

  if (!existsSync(coverageDir)) {
    console.log("No coverage directory found");
    return;
  }

  copyDirRecursive(coverageDir, outputCoverageDir);
  console.log("✓ Coverage reports copied");
}

function copyDirRecursive(src: string, dest: string): void {
  ensureDir(dest);

  const entries = readdirSync(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = join(src, entry.name);
    const destPath = join(dest, entry.name);

    if (entry.isDirectory()) {
      copyDirRecursive(srcPath, destPath);
    } else {
      try {
        copyFileSync(srcPath, destPath);
      } catch {
        // Ignore copy errors
      }
    }
  }
}

function collectLogs(outputDir: string): void {
  console.log("Collecting logs...");

  const outputLogsDir = join(outputDir, "logs");
  const logPatterns = [".", "logs", "tmp"];

  for (const dir of logPatterns) {
    if (!existsSync(dir)) {
      continue;
    }

    try {
      const entries = readdirSync(dir);

      for (const entry of entries) {
        if (!entry.endsWith(".log")) {
          continue;
        }

        const filePath = join(dir, entry);

        try {
          // Read directly and let error handling catch non-files or missing files
          const content = readFileSync(filePath, "utf8");
          const lines = content.split("\n");
          const lastLines = lines.slice(-1000).join("\n");

          writeFileSync(join(outputLogsDir, basename(entry)), lastLines);
        } catch {
          // Ignore individual file errors
        }
      }
    } catch {
      // Ignore directory read errors
    }
  }

  console.log("✓ Logs collected");
}

function formatTimestamp(date: Date): string {
  return date
    .toISOString()
    .replace("T", " ")
    .replace(/\.\d+Z$/, " UTC");
}

function generateReadme(outputDir: string, options: Options): void {
  const timestamp = formatTimestamp(new Date());

  let content = `# Evidence Bundle

Generated: ${timestamp}

## Contents

`;

  if (options.collectTests) {
    content += "- `test-results.txt` - Test execution output\n";
  }

  if (options.collectCoverage) {
    content += "- `coverage/` - Coverage reports\n";
  }

  if (options.collectLogs) {
    content += "- `logs/` - Application logs\n";
  }

  content += `
## Screenshots

Add before/after screenshots to \`screenshots/\` directory:
- \`before-[view].png\`
- \`after-[view].png\`

## Verification Checklist

- [ ] Test results reviewed
- [ ] Coverage acceptable
- [ ] Screenshots added
- [ ] Logs reviewed for errors
- [ ] No sensitive data included
`;

  writeFileSync(join(outputDir, "README.md"), content);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const options = parseArgs(args);

  // Create output directories
  ensureDir(options.outputDir);
  ensureDir(join(options.outputDir, "screenshots"));
  ensureDir(join(options.outputDir, "logs"));
  ensureDir(join(options.outputDir, "coverage"));

  console.log(`Collecting evidence to: ${options.outputDir}`);

  if (options.collectTests) {
    await collectTests(options.outputDir);
  }

  if (options.collectCoverage) {
    collectCoverage(options.outputDir);
  }

  if (options.collectLogs) {
    collectLogs(options.outputDir);
  }

  generateReadme(options.outputDir, options);

  console.log("");
  console.log("Evidence collection complete!");
  console.log(`Output: ${options.outputDir}`);
  console.log("");
  console.log("Next steps:");
  console.log(`1. Add screenshots to ${options.outputDir}/screenshots/`);
  console.log("2. Review and redact any sensitive data");
  console.log("3. Include evidence link in PR description");
}

main();
