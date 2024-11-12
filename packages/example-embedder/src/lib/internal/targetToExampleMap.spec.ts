import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { targetToExampleMap } from "./targetToExampleMap";

const TEST_DIR = join(__dirname, "..", "..", "..", `test-5`);
const EXAMPLES_DIR = join(TEST_DIR, "examples");
const SRC_DIR = join(TEST_DIR, "src");

describe("targetToExampleMap", () => {
  beforeEach(async () => {
    await rm(TEST_DIR, { recursive: true, force: true });
    await mkdir(EXAMPLES_DIR, { recursive: true });
    await mkdir(SRC_DIR, { recursive: true });
  });

  afterAll(async () => {
    await rm(TEST_DIR, { recursive: true, force: true });
  });

  it("finds examples and maps them to target files", async () => {
    const examplePath = join(EXAMPLES_DIR, "example.ts");
    const targetPath = join(SRC_DIR, "target.ts");
    const path = "src/target.ts";
    await writeFile(examplePath, [`// @example ${path}`, "const example = true;"].join("\n"));
    await writeFile(
      targetPath,
      ["/**", " * @example examples/example.ts", " */", "export const x = 1;"].join("\n"),
    );

    const result = await targetToExampleMap([examplePath]);

    expect(result).toMatchObject({
      [path]: {
        [examplePath]: "const example = true;",
      },
    });
  });

  it("finds multiple examples for the same target file", async () => {
    const example1Path = join(EXAMPLES_DIR, "example1.ts");
    const example2Path = join(EXAMPLES_DIR, "example2.ts");
    const path = "src/target.ts";
    await writeFile(example1Path, [`// @example ${path}`, "const example1 = true;"].join("\n"));
    await writeFile(example2Path, [`// @example ${path}`, "const example2 = true;"].join("\n"));

    const result = await targetToExampleMap([example1Path, example2Path]);

    expect(result).toMatchObject({
      [path]: {
        [example1Path]: "const example1 = true;",
        [example2Path]: "const example2 = true;",
      },
    });
  });

  it("finds examples in nested directories", async () => {
    const nested = join(EXAMPLES_DIR, "nested");
    await mkdir(nested, { recursive: true });
    const examplePath = join(nested, "example.ts");
    const path = "src/target.ts";
    await writeFile(examplePath, [`// @example ${path}`, "const example = true;"].join("\n"));

    const result = await targetToExampleMap([examplePath]);

    expect(result).toMatchObject({
      [path]: {
        [examplePath]: "const example = true;",
      },
    });
  });

  it("ignores files without @example annotation", async () => {
    const examplePath = join(EXAMPLES_DIR, "example.ts");
    await writeFile(examplePath, "const example = true;");

    const result = await targetToExampleMap([examplePath]);

    expect(result).toEqual({});
  });
});
