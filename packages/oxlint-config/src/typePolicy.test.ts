import { spawnSync, type SpawnSyncOptionsWithStringEncoding } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";

import { base, createOxlintConfig, typeAware } from "./index";

const OXLINT_CLI = path.join(
  path.dirname(createRequire(__filename).resolve("oxlint/package.json")),
  "bin/oxlint",
);

const TSGOLINT_EXECUTABLE = createRequire(__filename).resolve(
  `@oxlint-tsgolint/${process.platform}-${process.arch}/tsgolint${process.platform === "win32" ? ".exe" : ""}`,
);

interface LintOutput {
  diagnostics: Array<{ code: string; severity: string; filename: string; message: string }>;
}

describe("shared type-aware policy", () => {
  it("allows optional and never-return paths while compiler checks reject missing returns", () => {
    const directory = mkdtempSync(path.join(tmpdir(), "oxlint-return-policy-"));
    const configPath = path.join(directory, ".oxlintrc.json");
    const tsconfigPath = path.join(directory, "tsconfig.json");
    const fixturePath = path.join(directory, "policy.ts");

    try {
      writeFileSync(configPath, JSON.stringify(createOxlintConfig({ presets: [base, typeAware] })));
      writeFileSync(
        tsconfigPath,
        JSON.stringify({
          compilerOptions: {
            strict: true,
            noImplicitReturns: true,
            target: "ES2022",
            module: "ESNext",
            moduleResolution: "bundler",
            types: [],
            lib: ["ES2022"],
          },
          files: ["policy.ts"],
        }),
      );
      writeFileSync(
        fixturePath,
        `
export function findRecord(found: boolean): number | undefined {
  if (!found) { return; }
  return 1;
}
export function collectRecords(values: number[]) {
  return values.map(value => {
    if (value < 0) { return undefined; }
    return { id: value };
  }).filter(value => value !== undefined);
}
export class Lookup {
  public read(found: boolean): number {
    try { if (!found) { throw new Error("missing"); } return 1; }
    catch (error) { this.fail(error); }
  }
  private fail(error: unknown): never { throw error; }
}
`,
      );
      const args = [
        OXLINT_CLI,
        "--config",
        configPath,
        "--type-aware",
        "--type-check",
        "--threads=2",
        "--tsconfig",
        tsconfigPath,
        "--format",
        "json",
        fixturePath,
      ];
      const options: SpawnSyncOptionsWithStringEncoding = {
        cwd: directory,
        encoding: "utf8",
        env: { ...process.env, OXLINT_TSGOLINT_PATH: TSGOLINT_EXECUTABLE },
      };
      const validResult = spawnSync(process.execPath, args, options);
      expect(validResult.error).toBeUndefined();
      expect(validResult.status).toBe(0);
      const validOutput: LintOutput = JSON.parse(validResult.stdout);
      expect(validOutput.diagnostics).toStrictEqual([]);

      writeFileSync(
        fixturePath,
        `
export function forgetReturn(found: boolean) { if (found) { return 1; } }
export function requireResult(found: boolean): number { if (found) { return 1; } }
export function forgetMappedValue(values: number[]) {
  return values.map(value => { if (value > 0) { return value; } });
}
`,
      );
      const invalidResult = spawnSync(process.execPath, args, options);
      expect(invalidResult.error).toBeUndefined();
      expect(invalidResult.status).toBe(1);
      const invalidOutput: LintOutput = JSON.parse(invalidResult.stdout);
      expect(invalidOutput.diagnostics).toHaveLength(4);
      expect(
        invalidOutput.diagnostics.filter(({ code }) => code === "eslint(array-callback-return)"),
      ).toHaveLength(1);
      expect(invalidOutput.diagnostics.map(({ message }) => message)).toEqual(
        expect.arrayContaining([
          expect.stringContaining("Not all code paths return a value"),
          expect.stringContaining("Function lacks ending return statement"),
        ]),
      );
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("allows discarded sync results and explicit coercion while rejecting async and interpolation hazards", () => {
    const directory = mkdtempSync(path.join(tmpdir(), "oxlint-type-policy-"));
    const configPath = path.join(directory, ".oxlintrc.json");
    const tsconfigPath = path.join(directory, "tsconfig.json");
    const fixturePath = path.join(directory, "policy.ts");

    try {
      writeFileSync(configPath, JSON.stringify(createOxlintConfig({ presets: [base, typeAware] })));
      writeFileSync(
        tsconfigPath,
        JSON.stringify({
          compilerOptions: {
            strict: true,
            target: "ES2022",
            module: "ESNext",
            moduleResolution: "bundler",
            types: [],
            lib: ["ES2022"],
          },
          files: ["policy.ts"],
        }),
      );
      writeFileSync(
        fixturePath,
        `
export const values: number[] = [];
export const discardSync: (value: number) => void = (value) => values.push(value);
interface BoundaryInput { number: number; string: string; boolean: boolean; }
export function normalizeBoundary(value: BoundaryInput) {
  return { number: Number(value.number), string: \`\${value.string}\`, boolean: Boolean(value.boolean) };
}
export const discardAsync: () => void = async () => { throw new Error("fixture"); };
Promise.reject(new Error("fixture"));
export function unsafeInterpolation(value: Record<string, unknown>) { return \`\${value}\`; }
`,
      );

      const result = spawnSync(
        process.execPath,
        [
          OXLINT_CLI,
          "--config",
          configPath,
          "--type-aware",
          "--tsconfig",
          tsconfigPath,
          "--format",
          "json",
          fixturePath,
        ],
        {
          cwd: directory,
          encoding: "utf8",
          env: { ...process.env, OXLINT_TSGOLINT_PATH: TSGOLINT_EXECUTABLE },
        },
      );
      expect(result.error).toBeUndefined();
      expect(result.status).toBe(1);
      const output: LintOutput = JSON.parse(result.stdout);

      expect(
        output.diagnostics.map(({ code, severity }) => `${code}:${severity}`).toSorted(),
      ).toStrictEqual([
        "promise(catch-or-return):error",
        "typescript(no-base-to-string):error",
        "typescript(no-floating-promises):error",
        "typescript(no-misused-promises):error",
        "typescript(restrict-template-expressions):error",
      ]);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it.each(["ts", "tsx", "mts", "cts"])(
    "uses typed throw validation for .%s while retaining JavaScript validation",
    (extension) => {
      const directory = mkdtempSync(path.join(tmpdir(), "oxlint-throw-policy-"));
      const configPath = path.join(directory, ".oxlintrc.json");
      const tsconfigPath = path.join(directory, "tsconfig.json");
      const fixtureName = `policy.${extension}`;
      const fixturePath = path.join(directory, fixtureName);
      const javascriptPath = path.join(directory, "control.js");

      try {
        writeFileSync(
          configPath,
          JSON.stringify(createOxlintConfig({ presets: [base, typeAware] })),
        );
        writeFileSync(
          tsconfigPath,
          JSON.stringify({
            compilerOptions: {
              strict: true,
              target: "ES2022",
              module: "ESNext",
              moduleResolution: "bundler",
              jsx: "preserve",
              allowJs: true,
              checkJs: true,
              noEmit: true,
              types: [],
              lib: ["ES2022"],
            },
            files: [fixtureName, "control.js"],
          }),
        );
        writeFileSync(
          fixturePath,
          `
export function deferredError(error: Error) {
  let firstError: Error | undefined;
  for (const currentError of [error]) { firstError = currentError; }
  if (firstError !== undefined) { throw firstError; }
}
export function invalidString() { throw "not an Error"; }
export function invalidObject() { throw { reason: "not an Error" }; }
`,
        );
        writeFileSync(javascriptPath, 'throw "not an Error";\n');

        const result = spawnSync(
          process.execPath,
          [
            OXLINT_CLI,
            "--config",
            configPath,
            "--type-aware",
            "--threads=2",
            "--tsconfig",
            tsconfigPath,
            "--format",
            "json",
            fixturePath,
            javascriptPath,
          ],
          {
            cwd: directory,
            encoding: "utf8",
            env: { ...process.env, OXLINT_TSGOLINT_PATH: TSGOLINT_EXECUTABLE },
          },
        );
        expect(result.error).toBeUndefined();
        expect(result.status).toBe(1);
        const output: LintOutput = JSON.parse(result.stdout);

        expect(
          output.diagnostics
            .map(({ code, filename, severity }) => `${path.basename(filename)}:${code}:${severity}`)
            .toSorted(),
        ).toStrictEqual([
          "control.js:eslint(no-throw-literal):error",
          "control.js:typescript(only-throw-error):error",
          `${fixtureName}:typescript(only-throw-error):error`,
          `${fixtureName}:typescript(only-throw-error):error`,
        ]);
      } finally {
        rmSync(directory, { recursive: true, force: true });
      }
    },
  );
});
