import { spawnSync } from "node:child_process";
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
  diagnostics: Array<{ code: string; severity: string; filename: string }>;
}

describe("shared type-aware policy", () => {
  it("accepts explicit switch fallbacks while checking closed unions and retaining syntax guards", () => {
    const directory = mkdtempSync(path.join(tmpdir(), "oxlint-switch-policy-"));
    const configPath = path.join(directory, ".oxlintrc.json");
    const tsconfigPath = path.join(directory, "tsconfig.json");
    const fixturePath = path.join(directory, "policy.ts");
    const source = `
type Mode = "handled" | "other";
export function fallback(mode: Mode): string {
  switch (mode) { case "handled": return "handled"; default: return "fallback"; }
}
export function closedUnion(mode: Mode): void {
  // oxlint-disable-next-line default-case -- Closed unions are checked by typed exhaustiveness.
  switch (mode) { case "handled": break; case "other": break; }
}
`;

    function lint(): LintOutput {
      const result = spawnSync(
        process.execPath,
        [
          OXLINT_CLI,
          "--config",
          configPath,
          "--type-aware",
          "--type-check",
          "--threads=2",
          "--tsconfig",
          tsconfigPath,
          "--report-unused-disable-directives",
          "error",
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
      expect([0, 1]).toContain(result.status);
      const output: LintOutput = JSON.parse(result.stdout);
      return output;
    }

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
      writeFileSync(fixturePath, source);
      expect(lint().diagnostics).toStrictEqual([]);

      writeFileSync(
        fixturePath,
        source.replace('"handled" | "other"', '"handled" | "other" | "future"'),
      );
      const futureOutput = lint();
      expect(futureOutput.diagnostics).toHaveLength(1);
      expect(futureOutput.diagnostics[0]).toMatchObject({
        code: "typescript(switch-exhaustiveness-check)",
        severity: "error",
        message: expect.stringContaining('"future"'),
      });

      writeFileSync(
        configPath,
        JSON.stringify(
          createOxlintConfig({
            presets: [base, typeAware],
            localConfig: {
              rules: {
                "typescript/switch-exhaustiveness-check": [
                  "error",
                  { considerDefaultExhaustiveForUnions: false },
                ],
              },
            },
          }),
        ),
      );
      expect(lint().diagnostics.map(({ code }) => code)).toStrictEqual([
        "typescript(switch-exhaustiveness-check)",
        "typescript(switch-exhaustiveness-check)",
      ]);

      writeFileSync(configPath, JSON.stringify(createOxlintConfig({ presets: [base, typeAware] })));
      writeFileSync(
        fixturePath,
        `
export function missingDefault(value: string): void {
  switch (value) { case "handled": break; }
}
export function redundantLabel(value: string): string {
  switch (value) { case "handled": default: return "fallback"; }
}
export function branching(value: string): number {
  let result = 0;
  ${Array.from({ length: 21 }, (_, index) => `if (value === "${index}") { result += 1; }`).join("\n  ")}
  return result;
}
`,
      );
      expect(
        lint()
          .diagnostics.map(({ code }) => code)
          .toSorted(),
      ).toStrictEqual([
        "eslint(complexity)",
        "eslint(default-case)",
        "unicorn(no-useless-switch-case)",
      ]);
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
