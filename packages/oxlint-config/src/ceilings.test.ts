import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";

import { createOxlintConfig, type OxlintPreset } from "./index";

const OXLINT_CLI = path.join(
  path.dirname(createRequire(__filename).resolve("oxlint/package.json")),
  "bin/oxlint",
);

const TEST_FILES_PRESET: OxlintPreset = {
  categories: { correctness: "off" },
  overrides: [{ files: ["**/*.test.ts"], rules: { "max-lines": ["error", { max: 20 }] } }],
  rules: { "max-lines": ["error", { max: 10 }] },
};

describe("createOxlintConfig ceilings", () => {
  let directory: string;

  beforeEach(() => {
    directory = mkdtempSync(path.join(tmpdir(), "oxlint-config-ceilings-"));
  });

  afterEach(() => {
    rmSync(directory, { force: true, recursive: true });
  });

  it("lets a ceiling beat a later test-file override, which it cannot when listed first", () => {
    const files = {
      "src/big.test.ts": lines(25),
      "src/other.test.ts": lines(25),
    };
    const ceilings = { rules: { "max-lines": { "src/big.test.ts": 25 } }, version: 1 };
    const withCeilings = createOxlintConfig({ ceilings, presets: [TEST_FILES_PRESET] });
    // Without the factory, a ceiling written as an ordinary override ahead of the test glob loses.
    const ceilingFirst = createOxlintConfig({
      presets: [
        {
          overrides: [
            { files: ["src/big.test.ts"], rules: { "max-lines": ["error", { max: 25 }] } },
          ],
        },
        TEST_FILES_PRESET,
      ],
    });

    expect(lint({ config: withCeilings, directory, files })).toStrictEqual(["src/other.test.ts"]);
    expect(lint({ config: ceilingFirst, directory, files })).toStrictEqual([
      "src/big.test.ts",
      "src/other.test.ts",
    ]);
  });

  it("keeps the file's own rule options, because an override replaces them", () => {
    const files = { "src/commented.ts": `${lines(11)}// one\n// two\n` };
    const preset: OxlintPreset = {
      categories: { correctness: "off" },
      rules: { "max-lines": ["error", { max: 10, skipComments: true }] },
    };

    expect(
      lint({
        config: createOxlintConfig({
          ceilings: { rules: { "max-lines": { "src/commented.ts": 11 } }, version: 1 },
          presets: [preset],
        }),
        directory,
        files,
      }),
    ).toStrictEqual([]);
  });

  it("matches paths with glob metacharacters literally", () => {
    const files = { "app/[id]/page.ts": lines(15), "app/x/page.ts": lines(15) };

    expect(
      lint({
        config: createOxlintConfig({
          ceilings: { rules: { "max-lines": { "app/[id]/page.ts": 15 } }, version: 1 },
          presets: [TEST_FILES_PRESET],
        }),
        directory,
        files,
      }),
    ).toStrictEqual(["app/x/page.ts"]);
  });

  it("appends ceiling overrides after local overrides", () => {
    const config = createOxlintConfig({
      ceilings: { rules: { complexity: { "src/a.ts": 30 } }, version: 1 },
      localConfig: { overrides: [{ files: ["src/**"], rules: { complexity: ["warn", 25] } }] },
      presets: [{ rules: { complexity: ["error", { max: 20, variant: "modified" }] } }],
    });

    expect(config.overrides).toStrictEqual([
      { files: ["src/**"], rules: { complexity: ["warn", 25] } },
      { files: ["src/a.ts"], rules: { complexity: ["warn", { max: 30 }] } },
    ]);
  });

  it("returns the merged configuration unchanged without ceilings or when every rule is off", () => {
    const preset: OxlintPreset = { rules: { "max-lines": "off" } };

    expect(createOxlintConfig({ presets: [preset] })).toStrictEqual(preset);
    expect(
      createOxlintConfig({
        ceilings: { rules: { "max-lines": { "src/a.ts": 400 } }, version: 1 },
        presets: [preset],
      }),
    ).toStrictEqual(preset);
  });

  it("rejects an invalid ceilings file", () => {
    expect(() =>
      createOxlintConfig({ ceilings: { rules: { "eslint/max-lines": {} }, version: 1 } }),
    ).toThrow('Unsupported rule "eslint/max-lines"');
  });
});

function lines(count: number): string {
  return Array.from({ length: count }, (_, index) => `export const v${index} = ${index};\n`).join(
    "",
  );
}

function lint(params: {
  config: object;
  directory: string;
  files: Record<string, string>;
}): string[] {
  const { config, directory, files } = params;
  for (const [file, content] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(directory, file)), { recursive: true });
    writeFileSync(path.join(directory, file), content);
  }

  writeFileSync(path.join(directory, ".oxlintrc.json"), JSON.stringify(config));
  const result = spawnSync(process.execPath, [OXLINT_CLI, "--format=json", ...Object.keys(files)], {
    cwd: directory,
    encoding: "utf8",
  });
  const report: unknown = JSON.parse(result.stdout);
  const diagnostics =
    typeof report === "object" && report !== null && "diagnostics" in report
      ? report.diagnostics
      : undefined;
  if (!Array.isArray(diagnostics)) {
    throw new TypeError(`Unexpected oxlint output: ${result.stdout}`);
  }

  return [
    ...new Set(
      diagnostics.map((diagnostic: unknown) =>
        typeof diagnostic === "object" && diagnostic !== null && "filename" in diagnostic
          ? String(diagnostic.filename)
          : "",
      ),
    ),
  ].toSorted();
}
