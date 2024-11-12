import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { embedExamples } from "./embedExamples";

const TEST_DIR = join(__dirname, "..", "..", "..", `test-3`);
const EXAMPLES_DIR = join(TEST_DIR, "examples");
const SRC_DIR = join(TEST_DIR, "src");
const DOCS_DIR = join(TEST_DIR, "docs");

describe("embedExamples", () => {
  beforeEach(async () => {
    await rm(TEST_DIR, { recursive: true, force: true });
    await mkdir(EXAMPLES_DIR, { recursive: true });
    await mkdir(SRC_DIR, { recursive: true });
    await mkdir(DOCS_DIR, { recursive: true });
  });

  afterAll(async () => {
    await rm(TEST_DIR, { recursive: true, force: true });
  });

  describe("typescript files", () => {
    it("updates multiple example blocks with their corresponding examples", async () => {
      const targetPath = join(SRC_DIR, "target.ts");
      const targetContent = [
        "/**",
        " * Some docs",
        " * @example examples/first.ts",
        " * ```typescript",
        " * const old1 = 'code';",
        " * ```",
        " *",
        " * @example examples/second.ts",
        " * ```typescript",
        " * const old2 = 'code';",
        " * ```",
        " */",
        "export const x = 1;",
      ].join("\n");
      const exampleMap = {
        "examples/first.ts": "const first = 'example1';",
        "examples/second.ts": "const second = 'example2';",
      };
      await writeFile(targetPath, targetContent);

      await embedExamples(targetPath, exampleMap);

      const result = await readFile(targetPath, "utf8");
      expect(result).toBe(
        [
          "/**",
          " * Some docs",
          " * @example examples/first.ts",
          " * ```typescript",
          " * const first = 'example1';",
          " * ```",
          " *",
          " * @example examples/second.ts",
          " * ```typescript",
          " * const second = 'example2';",
          " * ```",
          " */",
          "export const x = 1;",
        ].join("\n"),
      );
    });

    it("preserves non-matching example blocks", async () => {
      const targetPath = join(SRC_DIR, "target.ts");
      const targetContent = [
        "/**",
        " * Some docs",
        " * @example examples/first.ts",
        " * ```typescript",
        " * const old1 = 'code';",
        " * ```",
        " *",
        " * @example",
        " * ```typescript",
        " * const shouldNotChange = 'code';",
        " * ```",
        " *",
        " * @example examples/second.ts",
        " * ```typescript",
        " * const old2 = 'code';",
        " * ```",
        " */",
        "export const x = 1;",
      ].join("\n");
      const exampleMap = {
        "examples/first.ts": "const first = 'example1';",
        "examples/second.ts": "const second = 'example2';",
      };
      await writeFile(targetPath, targetContent);

      await embedExamples(targetPath, exampleMap);

      const result = await readFile(targetPath, "utf8");
      expect(result).toBe(
        [
          "/**",
          " * Some docs",
          " * @example examples/first.ts",
          " * ```typescript",
          " * const first = 'example1';",
          " * ```",
          " *",
          " * @example",
          " * ```typescript",
          " * const shouldNotChange = 'code';",
          " * ```",
          " *",
          " * @example examples/second.ts",
          " * ```typescript",
          " * const second = 'example2';",
          " * ```",
          " */",
          "export const x = 1;",
        ].join("\n"),
      );
    });

    it("handles multiline example code correctly", async () => {
      const targetPath = join(SRC_DIR, "target.ts");
      const targetContent = [
        "/**",
        " * Some docs",
        " * @example examples/multiline.ts",
        " * ```typescript",
        " * const old = 'code';",
        " * ```",
        " */",
        "export const x = 1;",
      ].join("\n");
      const exampleMap = {
        "examples/multiline.ts":
          "const first = 'line1';\nconst second = 'line2';\n\nconst third = 'line3';",
      };
      await writeFile(targetPath, targetContent);

      await embedExamples(targetPath, exampleMap);

      const result = await readFile(targetPath, "utf8");
      expect(result).toBe(
        [
          "/**",
          " * Some docs",
          " * @example examples/multiline.ts",
          " * ```typescript",
          " * const first = 'line1';",
          " * const second = 'line2';",
          " *",
          " * const third = 'line3';",
          " * ```",
          " */",
          "export const x = 1;",
        ].join("\n"),
      );
    });

    it("ignores example paths not found in example map", async () => {
      const targetPath = join(SRC_DIR, "target.ts");
      const targetContent = [
        "/**",
        " * Some docs",
        " * @example examples/missing.ts",
        " * ```typescript",
        " * const old = 'code';",
        " * ```",
        " */",
        "export const x = 1;",
      ].join("\n");
      const exampleMap = {};
      await writeFile(targetPath, targetContent);

      await embedExamples(targetPath, exampleMap);

      const result = await readFile(targetPath, "utf8");
      expect(result).toBe(targetContent);
    });
  });

  describe("markdown files", () => {
    it("updates example blocks in markdown files", async () => {
      const targetPath = join(DOCS_DIR, "README.md");
      const targetContent = [
        "# Title",
        "",
        "@example examples/example.ts",
        "```typescript",
        "const old = 'code';",
        "```",
        "",
        "Some text",
      ].join("\n");
      const exampleMap = {
        "examples/example.ts": "const example = 'new';",
      };
      await writeFile(targetPath, targetContent);

      await embedExamples(targetPath, exampleMap);

      const result = await readFile(targetPath, "utf8");
      expect(result).toBe(
        [
          "# Title",
          "",
          "@example examples/example.ts",
          "```typescript",
          "const example = 'new';",
          "```",
          "",
          "Some text",
        ].join("\n"),
      );
    });

    it("preserves markdown formatting", async () => {
      const targetPath = join(DOCS_DIR, "README.md");
      const targetContent = [
        "# Title",
        "",
        "@example examples/example.ts",
        "```typescript",
        "const old = 'code';",
        "```",
        "",
        "- List item",
        "  - Nested item",
      ].join("\n");
      const exampleMap = {
        "examples/example.ts": "const example = 'new';",
      };
      await writeFile(targetPath, targetContent);

      await embedExamples(targetPath, exampleMap);

      const result = await readFile(targetPath, "utf8");
      expect(result).toBe(
        [
          "# Title",
          "",
          "@example examples/example.ts",
          "```typescript",
          "const example = 'new';",
          "```",
          "",
          "- List item",
          "  - Nested item",
        ].join("\n"),
      );
    });
  });
});
