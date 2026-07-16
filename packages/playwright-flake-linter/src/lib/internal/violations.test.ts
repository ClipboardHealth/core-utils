import { compareViolations } from "./violations";

describe("compareViolations", () => {
  it("uses locale-independent code-unit ordering", () => {
    const input = [
      {
        column: 1,
        filePath: "playwright/ä.spec.ts",
        line: 1,
        message: "first",
        ruleId: "fixed-sleep" as const,
      },
      {
        column: 1,
        filePath: "playwright/z.spec.ts",
        line: 1,
        message: "second",
        ruleId: "fixed-sleep" as const,
      },
    ];

    const actual = input.toSorted(compareViolations);

    expect(actual.map(({ filePath }) => filePath)).toEqual([
      "playwright/z.spec.ts",
      "playwright/ä.spec.ts",
    ]);
  });
});
