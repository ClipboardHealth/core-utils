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

function checkUsesItOverTest(codeLines: string[], issues: string[]): void {
  if (codeLines.some((line) => /\btest\s*\(/.test(line))) {
    issues.push("Uses test() instead of it() for test case declarations");
  }
}

function checkDescribeGrouping(codeLines: string[], issues: string[]): void {
  if (!codeLines.some((line) => /\bdescribe\s*\(/.test(line))) {
    issues.push("Missing describe() for grouping test cases");
  }
}

function checkVariableNaming(codeLines: string[], issues: string[]): void {
  const hasExpectedOrActual = codeLines.some(
    (line) => /\bexpected\b/.test(line) || /\bactual\b/.test(line),
  );
  if (!hasExpectedOrActual) {
    issues.push("Missing expected/actual variable naming convention");
  }
}

export default function (output: string): GradingResult {
  const issues: string[] = [];
  const codeLines = getCodeLines(output);

  checkUsesItOverTest(codeLines, issues);
  checkDescribeGrouping(codeLines, issues);
  checkVariableNaming(codeLines, issues);

  const pass = issues.length === 0;
  return {
    pass,
    score: pass ? 1 : 0,
    reason: pass ? "All testing rules followed" : `Testing rule violations: ${issues.join("; ")}`,
  };
}
