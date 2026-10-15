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

interface LintOutput {
  diagnostics: Array<{ code: string; severity: string }>;
}

describe("shared type-aware policy", () => {
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
        { cwd: directory, encoding: "utf8" },
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
});
