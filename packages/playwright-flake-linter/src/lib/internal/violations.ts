import type { PlaywrightFlakePatternViolation } from "../playwrightFlakeLinter";

export function compareViolations(
  first: PlaywrightFlakePatternViolation,
  second: PlaywrightFlakePatternViolation,
): number {
  return (
    first.filePath.localeCompare(second.filePath) ||
    first.line - second.line ||
    first.column - second.column ||
    first.ruleId.localeCompare(second.ruleId)
  );
}
