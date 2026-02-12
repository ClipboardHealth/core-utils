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

function checkExportedArrowFunctions(output: string, issues: string[]): void {
  if (/export\s+const\s+\w+\s*=\s*(?:async\s*)?\(/m.test(output)) {
    issues.push("Uses exported const arrow function instead of function keyword");
  }
}

function checkNullUsage(codeLines: string[], issues: string[]): void {
  const hasProhibitedNull = codeLines.some(
    (line) => /\bnull\b/.test(line) && !/JSON\.\w+/.test(line),
  );
  if (hasProhibitedNull) {
    issues.push("Uses null instead of undefined");
  }
}

function checkEnumDeclarations(output: string, issues: string[]): void {
  if (/\benum\s+\w+/.test(output)) {
    issues.push("Uses enum declaration");
  }
}

/* cspell:disable -- regex word boundaries */
const PROHIBITED_NAMING_PATTERNS = [
  { pattern: /\bagent(?!s?\.)(?=[A-Z]|\b)/i, term: "agent" },
  { pattern: /\bhcp\b/i, term: "hcp" },
  { pattern: /\bfacility(?=[A-Z]|\b)/i, term: "facility" },
  { pattern: /\bhcf\b/i, term: "hcf" },
] as const;
/* cspell:enable */

function checkNamingViolations(codeLines: string[], issues: string[]): void {
  for (const { pattern, term } of PROHIBITED_NAMING_PATTERNS) {
    if (codeLines.some((line) => pattern.test(line))) {
      issues.push(`Uses prohibited naming: "${term}" (use worker/workplace)`);
    }
  }
}

export default function (output: string): GradingResult {
  const issues: string[] = [];
  const codeLines = getCodeLines(output);

  checkExportedArrowFunctions(output, issues);
  checkNullUsage(codeLines, issues);
  checkEnumDeclarations(output, issues);
  checkNamingViolations(codeLines, issues);

  const pass = issues.length === 0;
  return {
    pass,
    score: pass ? 1 : 0,
    reason: pass
      ? "All TypeScript rules followed"
      : `TypeScript rule violations: ${issues.join("; ")}`,
  };
}
