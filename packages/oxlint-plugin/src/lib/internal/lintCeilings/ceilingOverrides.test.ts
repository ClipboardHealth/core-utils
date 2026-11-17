import { type CeilingConfig, createLintCeilingOverrides } from "./ceilingOverrides";

function overridesFor(params: {
  config: CeilingConfig;
  rules: Record<string, Record<string, number>>;
}): unknown {
  return createLintCeilingOverrides({
    ceilings: { rules: params.rules, version: 1 },
    config: params.config,
    env: {},
  }).overrides;
}

describe("createLintCeilingOverrides", () => {
  it("groups a file's rules into one override and sorts files", () => {
    expect(
      overridesFor({
        config: { rules: { complexity: "error", "max-lines": ["warn", { max: 1000 }] } },
        rules: {
          complexity: { "src/b.ts": 30 },
          "max-lines": { "src/b.ts": 1200, "src/a.ts": 1100 },
        },
      }),
    ).toStrictEqual([
      { files: ["./src/a.ts"], rules: { "max-lines": ["warn", { max: 1100 }] } },
      {
        files: ["./src/b.ts"],
        rules: { complexity: ["error", { max: 30 }], "max-lines": ["warn", { max: 1200 }] },
      },
    ]);
  });

  it("takes the last matching override's setting, including its options", () => {
    const config: CeilingConfig = {
      overrides: [
        {
          files: ["*.test.ts"],
          rules: { "max-lines": ["error", { max: 2000, skipBlankLines: true }] },
        },
        { files: ["src/legacy/**"], rules: { "eslint/max-lines": "warn" } },
      ],
      rules: { "max-lines": ["error", { max: 1000, skipComments: true }] },
    };

    expect(
      overridesFor({
        config,
        rules: {
          "max-lines": { "src/a.test.ts": 2500, "src/a.ts": 1500, "src/legacy/old.ts": 900 },
        },
      }),
    ).toStrictEqual([
      {
        files: ["./src/a.test.ts"],
        rules: { "max-lines": ["error", { max: 2500, skipBlankLines: true }] },
      },
      {
        files: ["./src/a.ts"],
        rules: { "max-lines": ["error", { max: 1500, skipComments: true }] },
      },
      { files: ["./src/legacy/old.ts"], rules: { "max-lines": ["warn", { max: 900 }] } },
    ]);
  });

  it("skips files where the rule is off, so a ceiling never re-enables it", () => {
    expect(
      overridesFor({
        config: {
          categories: { pedantic: "error" },
          overrides: [{ files: ["**/*.test.ts"], rules: { "max-lines": "off" } }],
        },
        rules: { "max-lines": { "src/a.test.ts": 2500, "src/a.ts": 400 } },
      }),
    ).toStrictEqual([{ files: ["./src/a.ts"], rules: { "max-lines": ["error", { max: 400 }] } }]);
  });

  it("follows categories and plugins for rules the configuration does not name", () => {
    const rules = { complexity: { "a.ts": 30 }, "import/max-dependencies": { "a.ts": 12 } };

    expect(overridesFor({ config: { categories: { restriction: 1 } }, rules })).toStrictEqual([
      { files: ["./a.ts"], rules: { complexity: ["warn", { max: 30 }] } },
    ]);
    expect(
      overridesFor({
        config: { categories: { pedantic: "deny", restriction: "allow" }, plugins: ["import"] },
        rules,
      }),
    ).toStrictEqual([
      { files: ["./a.ts"], rules: { "import/max-dependencies": ["error", { max: 12 }] } },
    ]);
    expect(
      overridesFor({ config: { rules: { "max-dependencies": [2, 10] } }, rules }),
    ).toStrictEqual([
      { files: ["./a.ts"], rules: { "import/max-dependencies": ["error", { max: 12 }] } },
    ]);
  });

  it("matches globs across dot directories, as Oxlint does", () => {
    expect(
      overridesFor({
        config: {
          overrides: [
            { files: ["**/*.test.ts"], rules: { "max-lines": ["error", { max: 2000 }] } },
            { files: ["{.storybook,stories}/**"], rules: { "max-lines": "off" } },
          ],
          rules: { "max-lines": ["error", { max: 1000, skipComments: true }] },
        },
        rules: { "max-lines": { ".storybook/main.ts": 1500, "src/.gen/x.test.ts": 2500 } },
      }),
    ).toStrictEqual([
      { files: ["./src/.gen/x.test.ts"], rules: { "max-lines": ["error", { max: 2500 }] } },
    ]);
  });

  it("replaces the maximum alias with max", () => {
    expect(
      overridesFor({
        config: { rules: { complexity: ["error", { maximum: 20, variant: "modified" }] } },
        rules: { complexity: { "a.ts": 30 } },
      }),
    ).toStrictEqual([
      { files: ["./a.ts"], rules: { complexity: ["error", { max: 30, variant: "modified" }] } },
    ]);
  });

  it("ignores an override for a file it excludes", () => {
    expect(
      overridesFor({
        config: {
          overrides: [
            { excludeFiles: ["src/legacy.ts"], files: ["src/**"], rules: { "max-lines": "off" } },
          ],
          rules: { "max-lines": "error" },
        },
        rules: { "max-lines": { "src/a.ts": 400, "src/legacy.ts": 400 } },
      }),
    ).toStrictEqual([
      { files: ["./src/legacy.ts"], rules: { "max-lines": ["error", { max: 400 }] } },
    ]);
  });

  it("strips a leading ./ from patterns and keeps slashless ones root-only, as Oxlint does", () => {
    const overrides = (params: { excludeFiles?: string[]; files: string[] }): unknown =>
      overridesFor({
        config: {
          overrides: [{ ...params, rules: { "max-lines": "off" } }],
          rules: { "max-lines": "error" },
        },
        rules: { "max-lines": { "legacy.ts": 400, "src/legacy.ts": 400 } },
      });
    const ceiling = (file: string): unknown => ({
      files: [`./${file}`],
      rules: { "max-lines": ["error", { max: 400 }] },
    });

    expect(overrides({ excludeFiles: ["./src/legacy.ts"], files: ["**/*.ts"] })).toStrictEqual([
      ceiling("src/legacy.ts"),
    ]);
    expect(overrides({ excludeFiles: ["./legacy.ts"], files: ["**/*.ts"] })).toStrictEqual([
      ceiling("legacy.ts"),
    ]);
    expect(overrides({ files: ["./legacy.ts"] })).toStrictEqual([ceiling("src/legacy.ts")]);
    expect(overrides({ files: ["./src/**"] })).toStrictEqual([ceiling("legacy.ts")]);
  });

  it("escapes glob metacharacters in paths", () => {
    expect(
      overridesFor({
        config: { rules: { "max-lines": "error" } },
        rules: { "max-lines": { "app/[id]/{x}/*?.ts": 400 } },
      }),
    ).toStrictEqual([
      {
        files: ["./app/[[]id[]]/[{]x[}]/[*][?].ts"],
        rules: { "max-lines": ["error", { max: 400 }] },
      },
    ]);
  });

  it("returns nothing when the environment asks to ignore ceilings", () => {
    expect(
      createLintCeilingOverrides({
        ceilings: { rules: { "max-lines": { "a.ts": 400 } }, version: 1 },
        config: { rules: { "max-lines": "error" } },
        env: { CBH_LINT_CEILINGS: "ignore" },
      }),
    ).toStrictEqual({ overrides: [] });
  });

  it("rejects an unknown severity", () => {
    expect(() =>
      overridesFor({
        config: { rules: { "max-lines": "loud" } },
        rules: { "max-lines": { "a.ts": 400 } },
      }),
    ).toThrow('Unknown Oxlint rule severity: "loud"');
  });
});
