import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";

import { base, createOxlintConfig, typeAware } from "./index";

const requireFromTest = createRequire(__filename);
const OXLINT_CLI = path.join(
  path.dirname(requireFromTest.resolve("oxlint/package.json")),
  "bin/oxlint",
);
const TSC_CLI = requireFromTest.resolve("typescript/bin/tsc");
const TSGOLINT_EXECUTABLE = requireFromTest.resolve(
  `@oxlint-tsgolint/${process.platform}-${process.arch}/tsgolint${process.platform === "win32" ? ".exe" : ""}`,
);
const ENUM_COMPARISON_RULE = "typescript/no-unsafe-enum-comparison";

interface LintOutput {
  diagnostics: Array<{ code: string; severity: string; labels: Array<{ span: { line: number } }> }>;
}

const FIXTURE = `
export enum HttpStatus { Ok = 200, Conflict = 409, Internal = 500 }
export enum OtherHttpStatus { Ok = 200, Internal = 500 }
export enum State { Open = "open", Closed = "closed" }
export enum OtherState { Open = "open", Closed = "closed" }
declare const wireStatus: number;
declare const input: string;
declare const state: State;
declare const otherState: OtherState;
declare const status: HttpStatus;
declare const otherStatus: OtherHttpStatus;
export const wireEquality = wireStatus === HttpStatus.Conflict;
export const wireRange = wireStatus >= HttpStatus.Internal;
export const serializedState = input === State.Open;
export const validatedInput = Object.values(State).find((value) => value === input);
export const matchingLiteral = state === "open";
// @ts-expect-error Distinct named string enums are incompatible.
export const distinctStringEnums = state === otherState;
// @ts-expect-error Distinct named numeric enums are incompatible.
export const distinctNumberEnums = status === otherStatus;
// @ts-expect-error A value outside the enum remains incompatible.
export const wrongLiteral = state === "typo";
export const StatusValues = { conflict: 409, internal: 500 } as const;
export const objectEquality = wireStatus === StatusValues.conflict;
export const objectRange = wireStatus >= StatusValues.internal;
export const StateValues = { open: "open", closed: "closed" } as const;
export const objectValidation = Object.values(StateValues).find((value) => value === input);
`.trimStart();

describe("enum comparison policy", () => {
  it.each([false, true])("keeps compiler validation with explicit opt-in %s", (optIn) => {
    const directory = mkdtempSync(path.join(tmpdir(), "oxlint-enum-comparison-"));
    const configPath = path.join(directory, ".oxlintrc.json");
    const tsconfigPath = path.join(directory, "tsconfig.json");
    const fixturePath = path.join(directory, "policy.ts");

    try {
      writeFileSync(fixturePath, FIXTURE);
      const duplicateEnumPath = path.join(directory, "duplicate.ts");
      writeFileSync(
        duplicateEnumPath,
        'export enum Duplicate { First = "same", Second = "same" }\n',
      );
      writeFileSync(
        tsconfigPath,
        JSON.stringify({
          compilerOptions: {
            strict: true,
            noEmit: true,
            target: "ES2022",
            module: "ESNext",
            moduleResolution: "bundler",
            types: [],
            lib: ["ES2022"],
          },
          files: ["policy.ts", "duplicate.ts"],
        }),
      );
      writeFileSync(
        configPath,
        JSON.stringify(
          createOxlintConfig({
            presets: [base, typeAware],
            ...(optIn ? { localConfig: { rules: { [ENUM_COMPARISON_RULE]: "error" } } } : {}),
          }),
        ),
      );

      const compilation = spawnSync(process.execPath, [TSC_CLI, "--project", tsconfigPath], {
        cwd: directory,
        encoding: "utf8",
      });
      expect(compilation.error).toBeUndefined();
      expect(compilation.stdout + compilation.stderr).toBe("");
      expect(compilation.status).toBe(0);

      const lint = spawnSync(
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
          duplicateEnumPath,
        ],
        {
          cwd: directory,
          encoding: "utf8",
          env: { ...process.env, OXLINT_TSGOLINT_PATH: TSGOLINT_EXECUTABLE },
        },
      );
      expect(lint.error).toBeUndefined();
      const output: LintOutput = JSON.parse(lint.stdout);

      expect(lint.status).toBe(1);
      expect(
        output.diagnostics.map(({ code, severity }) => `${code}:${severity}`).toSorted(),
      ).toStrictEqual([
        "typescript(no-duplicate-enum-values):error",
        ...(optIn
          ? Array.from({ length: 8 }, () => "typescript(no-unsafe-enum-comparison):error")
          : []),
      ]);
      expect(
        output.diagnostics
          .filter(({ code }) => code === "typescript(no-unsafe-enum-comparison)")
          .map(({ labels }) => labels[0]?.span.line)
          .toSorted((left, right) => (left ?? 0) - (right ?? 0)),
      ).toStrictEqual(optIn ? [11, 12, 13, 14, 15, 17, 19, 21] : []);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
