import { formatLintCeilings, parseLintCeilings, readLintCeilingsText } from "./ceilingsFile";

const CANONICAL = `{
  "version": 1,
  "rules": {
    "complexity": {
      "src/a.ts": 30
    },

    "max-lines": {
      "src/B.ts": 2100,

      "src/a.ts": 2500
    }
  }
}
`;

describe("parseLintCeilings", () => {
  it("accepts supported rules with positive integer ceilings", () => {
    expect(
      parseLintCeilings({
        value: { rules: { "import/max-dependencies": { "src/a.ts": 12 } }, version: 1 },
      }),
    ).toStrictEqual({ rules: { "import/max-dependencies": { "src/a.ts": 12 } }, version: 1 });
  });

  it("lists every problem", () => {
    const value = {
      extra: true,
      rules: {
        complexity: { "./src/a.ts": 30, "/abs.ts": 1, "src/b.ts": 0, "src/c.ts": 1.5 },
        "eslint/max-lines": {},
        "max-depth": [],
        "no-console": {},
      },
      version: 2,
    };

    expect(() => parseLintCeilings({ value })).toThrow(
      [
        "Invalid lint-ceilings.json:",
        '- "version" must be 1.',
        '- Unknown top-level key "extra".',
        '- "rules.complexity" path "./src/a.ts" must be normalized: no "./", "../" or empty segments.',
        '- "rules.complexity" path "/abs.ts" must be relative to the repository root and use forward slashes.',
        '- "rules.complexity.src/b.ts" must be a positive integer.',
        '- "rules.complexity.src/c.ts" must be a positive integer.',
        '- Unsupported rule "eslint/max-lines". Use one of: complexity, import/max-dependencies, max-depth, max-lines, max-lines-per-function, max-nested-callbacks, max-params, max-statements.',
        '- "rules.max-depth" must map file paths to numbers.',
        '- Unsupported rule "no-console". Use one of: complexity, import/max-dependencies, max-depth, max-lines, max-lines-per-function, max-nested-callbacks, max-params, max-statements.',
      ].join("\n"),
    );
  });

  it("rejects non-objects and missing rules", () => {
    expect(() => parseLintCeilings({ value: [] })).toThrow("must be a JSON object");
    expect(() => parseLintCeilings({ value: { version: 1 } })).toThrow(
      '"rules" must be an object.',
    );
    expect(() =>
      parseLintCeilings({ value: { rules: { "max-lines": { " a.ts": 1 } }, version: 1 } }),
    ).toThrow("must be a non-empty path without surrounding whitespace");
  });
});

describe("formatLintCeilings", () => {
  it("sorts rules and paths by code point, separates entries with blank lines, and drops empty rules", () => {
    expect(
      formatLintCeilings({
        ceilings: {
          rules: {
            "max-lines": { "src/a.ts": 2500, "src/B.ts": 2100 },
            "max-depth": {},
            complexity: { "src/a.ts": 30 },
          },
          version: 1,
        },
      }),
    ).toBe(CANONICAL);
  });

  it("writes an empty rules object when nothing is listed", () => {
    expect(formatLintCeilings({ ceilings: { rules: { complexity: {} }, version: 1 } })).toBe(
      '{\n  "version": 1,\n  "rules": {}\n}\n',
    );
  });
});

describe("readLintCeilingsText", () => {
  it("reports whether the text is in the canonical layout", () => {
    expect(readLintCeilingsText({ text: CANONICAL }).canonical).toBe(true);
    expect(
      readLintCeilingsText({ text: CANONICAL.replace(",\n\n      ", ",\n      ") }).canonical,
    ).toBe(false);
  });

  it("names the file when the JSON is invalid", () => {
    expect(() => readLintCeilingsText({ text: "{" })).toThrow(
      "lint-ceilings.json is not valid JSON",
    );
  });
});
