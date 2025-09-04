/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument, @typescript-eslint/restrict-template-expressions, security/detect-non-literal-fs-filename, no-console, n/no-process-exit, unicorn/no-process-exit, @typescript-eslint/no-unsafe-return, radix, unicorn/prefer-top-level-await, no-await-in-loop */

/**
 * Axios Version Compatibility Test Script
 *
 * This script tests our axios-error package against different versions of axios
 * to ensure compatibility across the ecosystem.
 */

import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import * as path from "node:path";

interface VersionTestResult {
  version: string;
  success: boolean;
  testResults?:
    | {
        totalTests: number;
        passedTests: number;
        failedTests: number;
        errors: string[];
      }
    | undefined;
  error?: string | undefined;
  duration: number;
}

interface CompatibilityReport {
  timestamp: string;
  packageVersion: string;
  testedVersions: VersionTestResult[];
  summary: {
    total: number;
    passed: number;
    failed: number;
    successRate: number;
  };
}

/**
 * Axios versions to test against
 * Includes major versions and specific versions used in CBH codebases
 */
const AXIOS_VERSIONS = [
  "1.7.0", // Minimum supported version
  "1.7.2", // clipboard-health version
  "1.7.7", // Latest 1.7.x
  "1.8.0", // First 1.8.x
  "1.8.2", // cbh-mobile-app version
  "1.8.9", // Latest 1.8.x (as of implementation)
  // '2.0.0',   // Future major version (when available)
];

class AxiosVersionTester {
  private readonly packagePath: string;
  private readonly originalPackageJson: string;

  constructor() {
    this.packagePath = path.resolve(__dirname, "../../package.json");
    this.originalPackageJson = readFileSync(this.packagePath, "utf8");
  }

  async testAllVersions(): Promise<CompatibilityReport> {
    console.log("🔍 Starting axios version compatibility testing...");
    console.log(`Testing against ${AXIOS_VERSIONS.length} versions: ${AXIOS_VERSIONS.join(", ")}`);

    const results: VersionTestResult[] = [];

    for (const version of AXIOS_VERSIONS) {
      console.log(`\n📦 Testing axios@${version}...`);
      const result = await this.testVersion(version);
      results.push(result);

      if (result.success) {
        console.log(`✅ axios@${version} - PASSED (${result.duration}ms)`);
        if (result.testResults) {
          console.log(
            `   ${result.testResults.passedTests}/${result.testResults.totalTests} tests passed`,
          );
        }
      } else {
        console.log(`❌ axios@${version} - FAILED (${result.duration}ms)`);
        console.log(`   Error: ${result.error}`);
      }
    }

    // Restore original package.json
    this.restoreOriginalPackageJson();

    const report = this.generateReport(results);
    this.saveReport(report);
    this.printSummary(report);

    return report;
  }

  private async testVersion(version: string): Promise<VersionTestResult> {
    const startTime = Date.now();

    try {
      // Install specific axios version
      await this.installAxiosVersion(version);

      // Run tests
      const testResults = await this.runTests();

      return {
        version,
        success: testResults.success,
        testResults: testResults.success
          ? {
              totalTests: testResults.totalTests ?? 0,
              passedTests: testResults.passedTests ?? 0,
              failedTests: testResults.failedTests ?? 0,
              errors: testResults.errors ?? [],
            }
          : undefined,
        error: testResults.success ? undefined : testResults.error,
        duration: Date.now() - startTime,
      };
    } catch (error) {
      return {
        version,
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
        duration: Date.now() - startTime,
      };
    }
  }

  private async installAxiosVersion(version: string): Promise<void> {
    try {
      // Update package.json to use specific version
      const packageJson = JSON.parse(readFileSync(this.packagePath, "utf8"));
      packageJson.devDependencies.axios = version;
      writeFileSync(this.packagePath, JSON.stringify(packageJson, null, 2));

      // Install dependencies
      execSync("npm install", {
        cwd: path.dirname(this.packagePath),
        stdio: "pipe", // Suppress output
      });
    } catch (error) {
      throw new Error(`Failed to install axios@${version}: ${error}`);
    }
  }

  private async runTests(): Promise<{
    success: boolean;
    totalTests?: number;
    passedTests?: number;
    failedTests?: number;
    errors?: string[];
    error?: string;
  }> {
    try {
      const output = execSync("npm test", {
        cwd: path.dirname(this.packagePath),
        encoding: "utf8",
        stdio: "pipe",
      });

      // Parse Jest output to extract test results
      const testResults = this.parseJestOutput(output);

      return {
        success: testResults.failedTests === 0,
        ...testResults,
      };
    } catch (error) {
      // Jest exits with non-zero code on test failures
      if (error instanceof Error && "stdout" in error) {
        const output = (error as any).stdout;
        const testResults = this.parseJestOutput(output);

        return {
          success: false,
          error: `Tests failed: ${testResults.failedTests} failures`,
          ...testResults,
        };
      }

      return {
        success: false,
        error: error instanceof Error ? error.message : "Test execution failed",
      };
    }
  }

  private parseJestOutput(output: string): {
    totalTests: number;
    passedTests: number;
    failedTests: number;
    errors: string[];
  } {
    const result = {
      totalTests: 0,
      passedTests: 0,
      failedTests: 0,
      errors: [] as string[],
    };

    try {
      // Extract test summary from Jest output
      const summaryMatch = /tests:\s+(\d+)\s+failed,\s+(\d+)\s+passed,\s+(\d+)\s+total/i.exec(
        output,
      );
      if (summaryMatch?.[1] && summaryMatch[2] && summaryMatch[3]) {
        result.failedTests = Number.parseInt(summaryMatch[1]);
        result.passedTests = Number.parseInt(summaryMatch[2]);
        result.totalTests = Number.parseInt(summaryMatch[3]);
      } else {
        // Try alternative format
        const altMatch = /tests:\s+(\d+)\s+passed,\s+(\d+)\s+total/i.exec(output);
        if (altMatch?.[1] && altMatch[2]) {
          result.passedTests = Number.parseInt(altMatch[1]);
          result.totalTests = Number.parseInt(altMatch[2]);
          result.failedTests = result.totalTests - result.passedTests;
        }
      }

      // Extract error messages
      const errorMatches = output.matchAll(/FAIL.*?\n(.*?)\n/g);
      for (const match of errorMatches) {
        if (match[1]) {
          result.errors.push(match[1]);
        }
      }
    } catch {
      // If parsing fails, return defaults
    }

    return result;
  }

  private generateReport(results: VersionTestResult[]): CompatibilityReport {
    const passed = results.filter((r) => r.success).length;
    const failed = results.length - passed;

    return {
      timestamp: new Date().toISOString(),
      packageVersion: this.getPackageVersion(),
      testedVersions: results,
      summary: {
        total: results.length,
        passed,
        failed,
        successRate: Math.round((passed / results.length) * 100),
      },
    };
  }

  private saveReport(report: CompatibilityReport): void {
    const reportPath = path.resolve(__dirname, "../compatibility-report.json");
    writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log(`\n📊 Compatibility report saved to: ${reportPath}`);
  }

  private printSummary(report: CompatibilityReport): void {
    console.log(`\n${"=".repeat(60)}`);
    console.log("📋 AXIOS COMPATIBILITY TEST SUMMARY");
    console.log("=".repeat(60));
    console.log(`Package Version: ${report.packageVersion}`);
    console.log(`Test Date: ${report.timestamp}`);
    console.log(
      `Success Rate: ${report.summary.successRate}% (${report.summary.passed}/${report.summary.total})`,
    );

    if (report.summary.failed > 0) {
      console.log("\n❌ FAILED VERSIONS:");
      report.testedVersions
        .filter((r) => !r.success)
        .forEach((r) => {
          console.log(`  - axios@${r.version}: ${r.error}`);
        });
    }

    console.log("\n✅ PASSED VERSIONS:");
    report.testedVersions
      .filter((r) => r.success)
      .forEach((r) => {
        console.log(`  - axios@${r.version} (${r.duration}ms)`);
      });

    console.log(`\n${"=".repeat(60)}`);

    // Exit with error code if any tests failed
    if (report.summary.failed > 0) {
      console.log(`\n⚠️  ${report.summary.failed} version(s) failed compatibility tests`);
      process.exit(1);
    } else {
      console.log("\n🎉 All axios versions passed compatibility tests!");
    }
  }

  private getPackageVersion(): string {
    try {
      const packageJson = JSON.parse(this.originalPackageJson);
      return packageJson.version ?? "0.0.0";
    } catch {
      return "0.0.0";
    }
  }

  private restoreOriginalPackageJson(): void {
    writeFileSync(this.packagePath, this.originalPackageJson);
  }
}

// CLI execution
if (require.main === module) {
  const tester = new AxiosVersionTester();

  tester.testAllVersions().catch((error) => {
    console.error("❌ Version testing failed:", error);
    process.exit(1);
  });
}

/* eslint-enable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument, @typescript-eslint/restrict-template-expressions, security/detect-non-literal-fs-filename, no-console, n/no-process-exit, unicorn/no-process-exit, @typescript-eslint/no-unsafe-return, radix, unicorn/prefer-top-level-await, no-await-in-loop */
