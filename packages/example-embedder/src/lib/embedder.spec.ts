import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { embedder } from "./embedder";

const TEST_DIR = join(__dirname, "..", "..", "test-1");
const EXAMPLES_DIR = join(TEST_DIR, "examples");
const SRC_DIR = join(TEST_DIR, "src");

async function setupTestFiles(exampleContent: string, targetContent: string) {
  const examplePath = join(EXAMPLES_DIR, "example.ts");
  const targetPath = join(SRC_DIR, "target.ts");
  await writeFile(examplePath, [`// @example src/target.ts`, exampleContent].join("\n"));
  await writeFile(targetPath, targetContent);
  return { examplePath, targetPath };
}

describe("embedder", () => {
  beforeEach(async () => {
    await rm(TEST_DIR, { recursive: true, force: true });
    await mkdir(EXAMPLES_DIR, { recursive: true });
    await mkdir(SRC_DIR, { recursive: true });
    process.chdir(TEST_DIR);
  });

  afterAll(async () => {
    await rm(TEST_DIR, { recursive: true, force: true });
  });

  it("embeds examples in target files", async () => {
    const code = "const example = true;";
    const { targetPath } = await setupTestFiles(
      code,
      [
        "/**",
        " * @example examples/example.ts",
        " * ```typescript",
        " * const old = false;",
        " * ```",
        " */",
        "export const x = 1;",
      ].join("\n"),
    );

    await embedder({ directory: EXAMPLES_DIR });

    const actual = await readFile(targetPath, "utf8");
    expect(actual).toBe(
      [
        "/**",
        " * @example examples/example.ts",
        " * ```typescript",
        " * const example = true;",
        " * ```",
        " */",
        "export const x = 1;",
      ].join("\n"),
    );
  });

  it("throws error in check mode when examples don't match", async () => {
    await setupTestFiles(
      "const example = true;",
      [
        "/**",
        " * @example examples/example.ts",
        " * ```typescript",
        " * const old = false;",
        " * ```",
        " */",
        "export const x = 1;",
      ].join("\n"),
    );

    await expect(embedder({ directory: EXAMPLES_DIR, check: true })).rejects.toThrow(
      /Mismatch in file '.+' for example '.+'/,
    );
  });

  it("succeeds in check mode when examples match", async () => {
    await setupTestFiles(
      "const example = true;",
      [
        "/**",
        " * @example examples/example.ts",
        " * ```typescript",
        " * const example = true;",
        " * ```",
        " */",
        "export const x = 1;",
      ].join("\n"),
    );

    await expect(embedder({ directory: EXAMPLES_DIR, check: true })).resolves.not.toThrow();
  });
});
