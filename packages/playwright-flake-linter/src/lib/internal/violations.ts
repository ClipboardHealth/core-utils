import type { PlaywrightFlakePatternViolation } from "../playwrightFlakeLinter";

export function compareViolations(
  first: PlaywrightFlakePatternViolation,
  second: PlaywrightFlakePatternViolation,
): number {
  return (
    compareStrings({ first: first.filePath, second: second.filePath }) ||
    first.line - second.line ||
    first.column - second.column ||
    compareStrings({ first: first.ruleId, second: second.ruleId })
  );
}

interface CompareStringsParams {
  first: string;
  second: string;
}

function compareStrings({ first, second }: CompareStringsParams): number {
  if (first === second) {
    return 0;
  }

  return first < second ? -1 : 1;
}
