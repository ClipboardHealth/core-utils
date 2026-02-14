interface GradingResult {
  pass: boolean;
  score: number;
  reason: string;
}

function isCommentLine(line: string): boolean {
  const trimmed = line.trim();
  return trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/*");
}

function getCodeLines(output: string): string[] {
  return output.split("\n").filter((line) => !isCommentLine(line));
}

function checkStructuredLogging(codeLines: string[], issues: string[]): void {
  const hasTemplateInLogger = codeLines.some(
    (line) => /logger\.\w+\s*\(/.test(line) && /\$\{/.test(line),
  );
  if (hasTemplateInLogger) {
    issues.push(
      "Uses template literal interpolation in logger calls instead of structured context",
    );
  }
}

function checkNoLoggedPii(codeLines: string[], issues: string[]): void {
  const hasWorkerEmailInLog = codeLines.some(
    (line) => /logger\.\w+\s*\(/.test(line) && /workerEmail/.test(line),
  );
  if (hasWorkerEmailInLog) {
    issues.push("Logs PII (workerEmail) in logger calls");
  }
}

function checkLogLevelUsage(codeLines: string[], issues: string[]): void {
  const hasError = codeLines.some((line) => /logger\.error\s*\(/.test(line));
  const hasInfo = codeLines.some((line) => /logger\.info\s*\(/.test(line));
  if (!hasError) {
    issues.push("Missing logger.error() for failure scenarios");
  }
  if (!hasInfo) {
    issues.push("Missing logger.info() for informational logging");
  }
}

export default function (output: string): GradingResult {
  const issues: string[] = [];
  const codeLines = getCodeLines(output);

  checkStructuredLogging(codeLines, issues);
  checkNoLoggedPii(codeLines, issues);
  checkLogLevelUsage(codeLines, issues);

  const pass = issues.length === 0;
  return {
    pass,
    score: pass ? 1 : 0,
    reason: pass ? "All logging rules followed" : `Logging rule violations: ${issues.join("; ")}`,
  };
}
