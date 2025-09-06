/* eslint-disable unicorn/prevent-abbreviations, security/detect-non-literal-fs-filename, no-console, n/no-process-exit, unicorn/no-process-exit, @typescript-eslint/no-unsafe-assignment, global-require, @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires */

/**
 * Generates compatibility documentation in multiple formats
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import * as path from "node:path";

interface CompatibilityReport {
  timestamp: string;
  packageVersion: string;
  testedVersions: Array<{
    version: string;
    success: boolean;
    testResults?: {
      totalTests: number;
      passedTests: number;
      failedTests: number;
    };
    error?: string;
    duration: number;
  }>;
  summary: {
    total: number;
    passed: number;
    failed: number;
    successRate: number;
  };
}

class CompatibilityDocsGenerator {
  private readonly reportPath: string;
  private readonly docsDir: string;

  constructor() {
    this.reportPath = path.resolve(__dirname, "../compatibility-report.json");
    this.docsDir = path.resolve(__dirname, "../../docs");
  }

  generate(): void {
    if (!existsSync(this.reportPath)) {
      console.log("❌ No compatibility report found. Run npm run test:axios-versions first.");
      process.exit(1);
    }

    const report: CompatibilityReport = JSON.parse(readFileSync(this.reportPath, "utf8"));

    console.log("📖 Generating compatibility documentation...");

    // Create docs directory if it doesn't exist
    if (!existsSync(this.docsDir)) {
      require("node:fs").mkdirSync(this.docsDir, { recursive: true });
    }

    // Generate different formats
    this.generateMarkdown(report);
    this.generateBadge(report);
    this.generateHTML(report);

    console.log("✅ Documentation generated successfully!");
  }

  private generateMarkdown(report: CompatibilityReport): void {
    const markdown = `# Axios Compatibility

> Last updated: ${new Date(report.timestamp).toLocaleDateString()}
> Package version: v${report.packageVersion}

## Summary

**Success Rate: ${report.summary.successRate}%** (${report.summary.passed}/${report.summary.total} versions)

## Tested Versions

| Axios Version | Status | Tests | Duration | Notes |
|---------------|--------|-------|----------|-------|
${report.testedVersions
  .map((v) => {
    const status = v.success ? "✅ Pass" : "❌ Fail";
    const tests = v.testResults ? `${v.testResults.passedTests}/${v.testResults.totalTests}` : "-";
    const duration = `${v.duration}ms`;
    const notes = v.error ?? (v.success ? "All tests pass" : "See logs");

    return `| ${v.version} | ${status} | ${tests} | ${duration} | ${notes} |`;
  })
  .join("\n")}

## Usage with Different Versions

This package officially supports axios versions **1.7.0** and higher. Here's how to use it:

### NPM/Yarn

\`\`\`bash
# Install with your preferred axios version
npm install @clipboard-health/axios-error axios@1.7.2
\`\`\`

### Peer Dependencies

This package declares axios as a peer dependency with the range \`^1.7.0 || ^1.8.0\`, allowing you to choose the version that works best for your project.

### Version-Specific Notes

${this.generateVersionNotes(report)}

## Testing Against New Versions

To test this package against a specific axios version:

\`\`\`bash
# Test a specific version
npm run test:axios-version -- 1.8.5

# Test all supported versions
npm run test:axios-versions

# Generate updated compatibility report
npm run compatibility:report
\`\`\`

## Compatibility Issues

If you encounter issues with a specific axios version:

1. Check this compatibility matrix
2. Run the test suite with your version: \`npm run test:axios-version -- <version>\`
3. [Report an issue](https://github.com/ClipboardHealth/core-utils/issues) with:
   - Your axios version
   - Error details
   - Minimal reproduction case
`;

    const markdownPath = path.join(this.docsDir, "compatibility.md");
    writeFileSync(markdownPath, markdown);
    console.log(`📝 Markdown documentation: ${markdownPath}`);
  }

  private generateBadge(report: CompatibilityReport): void {
    const badgeData = {
      schemaVersion: 1,
      label: "axios compatibility",
      message: `${report.summary.successRate}%`,
      color:
        report.summary.successRate === 100
          ? "brightgreen"
          : report.summary.successRate >= 80
            ? "yellow"
            : "red",
      namedLogo: "axios",
    };

    const badgePath = path.join(this.docsDir, "compatibility-badge.json");
    writeFileSync(badgePath, JSON.stringify(badgeData, null, 2));
    console.log(`🏷️  Badge data: ${badgePath}`);
  }

  private generateHTML(report: CompatibilityReport): void {
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Axios Compatibility Report - @clipboard-health/axios-error</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif; max-width: 1200px; margin: 0 auto; padding: 20px; }
        .header { text-align: center; margin-bottom: 30px; }
        .summary { background: #f8f9fa; border-radius: 8px; padding: 20px; margin-bottom: 30px; }
        .success-rate { font-size: 2em; font-weight: bold; color: ${report.summary.successRate === 100 ? "#28a745" : report.summary.successRate >= 80 ? "#ffc107" : "#dc3545"}; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 30px; }
        th, td { padding: 12px; text-align: left; border-bottom: 1px solid #dee2e6; }
        th { background: #f8f9fa; font-weight: 600; }
        .status-pass { color: #28a745; }
        .status-fail { color: #dc3545; }
        .footer { text-align: center; color: #6c757d; font-size: 0.9em; margin-top: 40px; }
    </style>
</head>
<body>
    <div class="header">
        <h1>Axios Compatibility Report</h1>
        <p>Package: @clipboard-health/axios-error v${report.packageVersion}</p>
        <p>Generated: ${new Date(report.timestamp).toLocaleString()}</p>
    </div>

    <div class="summary">
        <h2>Summary</h2>
        <div class="success-rate">${report.summary.successRate}%</div>
        <p>${report.summary.passed} out of ${report.summary.total} axios versions passed all tests</p>
    </div>

    <table>
        <thead>
            <tr>
                <th>Axios Version</th>
                <th>Status</th>
                <th>Tests Passed</th>
                <th>Duration</th>
                <th>Notes</th>
            </tr>
        </thead>
        <tbody>
            ${report.testedVersions
              .map(
                (v) => `
                <tr>
                    <td><code>axios@${v.version}</code></td>
                    <td class="${v.success ? "status-pass" : "status-fail"}">
                        ${v.success ? "✅ Pass" : "❌ Fail"}
                    </td>
                    <td>${v.testResults ? `${v.testResults.passedTests}/${v.testResults.totalTests}` : "-"}</td>
                    <td>${v.duration}ms</td>
                    <td>${v.error ?? (v.success ? "All tests pass" : "See logs")}</td>
                </tr>
            `,
              )
              .join("")}
        </tbody>
    </table>

    <div class="footer">
        <p>Generated by @clipboard-health/axios-error test suite</p>
        <p>Run <code>npm run test:axios-versions</code> to generate an updated report</p>
    </div>
</body>
</html>`;

    const htmlPath = path.join(this.docsDir, "compatibility.html");
    writeFileSync(htmlPath, html);
    console.log(`🌐 HTML report: ${htmlPath}`);
  }

  private generateVersionNotes(report: CompatibilityReport): string {
    const notes = [];

    // Add notes for failed versions
    const failed = report.testedVersions.filter((v) => !v.success);
    if (failed.length > 0) {
      notes.push("### ⚠️ Incompatible Versions\n");
      failed.forEach((v) => {
        notes.push(`- **${v.version}**: ${v.error}`);
      });
      notes.push("");
    }

    // Add notes for special versions
    const cbhVersions = ["1.7.2", "1.8.2"];
    cbhVersions.forEach((version) => {
      const result = report.testedVersions.find((v) => v.version === version);
      if (result) {
        notes.push(
          `- **${version}**: Used in CBH ${version === "1.7.2" ? "clipboard-health" : "cbh-mobile-app"} - ${result.success ? "✅ Fully supported" : "❌ Issues detected"}`,
        );
      }
    });

    return notes.join("\n");
  }
}

// CLI execution
if (require.main === module) {
  const generator = new CompatibilityDocsGenerator();
  generator.generate();
}

/* eslint-enable unicorn/prevent-abbreviations, security/detect-non-literal-fs-filename, no-console, n/no-process-exit, unicorn/no-process-exit, @typescript-eslint/no-unsafe-assignment, global-require, @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires */
