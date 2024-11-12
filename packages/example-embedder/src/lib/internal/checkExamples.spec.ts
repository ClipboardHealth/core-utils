import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { checkExamples } from "./checkExamples";

const TEST_DIR = join(__dirname, "..", "..", "..", `test-2`);
const EXAMPLES_DIR = join(TEST_DIR, "examples");
const SRC_DIR = join(TEST_DIR, "src");

describe("checkExamples", () => {
  beforeEach(async () => {
    await rm(TEST_DIR, { recursive: true, force: true });
    await mkdir(EXAMPLES_DIR, { recursive: true });
    await mkdir(SRC_DIR, { recursive: true });
  });

  afterAll(async () => {
    await rm(TEST_DIR, { recursive: true, force: true });
  });

  it("returns mismatches when example code differs from file content", async () => {
    const targetPath = join(SRC_DIR, "target.ts");
    const targetContent = [
      "/**",
      " * Some docs",
      " * @example examples/first.ts",
      " * ```typescript",
      " * const old = 'code';",
      " * ```",
      " */",
      "export const x = 1;",
    ].join("\n");
    const exampleMap = {
      "examples/first.ts": "const new = 'example';",
    };
    await writeFile(targetPath, targetContent);

    const result = await checkExamples({ [targetPath]: exampleMap });

    expect(result).toEqual([
      {
        targetPath,
        examplePath: "examples/first.ts",
      },
    ]);
  });

  it("returns empty array when all examples match", async () => {
    const targetPath = join(SRC_DIR, "target.ts");
    const code = "const example = 'code';";
    const targetContent = [
      "/**",
      " * Some docs",
      " * @example examples/first.ts",
      " * ```typescript",
      ` * ${code}`,
      " * ```",
      " */",
      "export const x = 1;",
    ].join("\n");
    const exampleMap = {
      "examples/first.ts": code,
    };
    await writeFile(targetPath, targetContent);

    const result = await checkExamples({ [targetPath]: exampleMap });

    expect(result).toEqual([]);
  });

  it("ignores examples not found in example map", async () => {
    const targetPath = join(SRC_DIR, "target.ts");
    const targetContent = [
      "/**",
      " * Some docs",
      " * @example examples/missing.ts",
      " * ```typescript",
      " * const code = 'example';",
      " * ```",
      " */",
      "export const x = 1;",
    ].join("\n");
    await writeFile(targetPath, targetContent);

    const result = await checkExamples({ [targetPath]: {} });

    expect(result).toEqual([]);
  });
});
