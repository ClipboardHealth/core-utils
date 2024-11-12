import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { findFilePaths } from "./findFilePaths";

const TEST_DIR = join(__dirname, "..", "..", "..", `test-4`);

describe("findFilePaths", () => {
  beforeEach(async () => {
    await rm(TEST_DIR, { recursive: true, force: true });
    await mkdir(TEST_DIR, { recursive: true });
  });

  afterAll(async () => {
    await rm(TEST_DIR, { recursive: true, force: true });
  });

  it("finds files with matching extension", async () => {
    const filePath = join(TEST_DIR, "test.ts");
    await writeFile(filePath, "");

    const result = await findFilePaths({
      directory: TEST_DIR,
      extension: ".ts",
    });

    expect(result).toEqual([filePath]);
  });

  it("ignores files with non-matching extension", async () => {
    const filePath = join(TEST_DIR, "test.js");
    await writeFile(filePath, "");

    const result = await findFilePaths({
      directory: TEST_DIR,
      extension: ".ts",
    });

    expect(result).toEqual([]);
  });

  it("finds files in nested directories", async () => {
    const nested = join(TEST_DIR, "nested");
    await mkdir(nested);
    const filePath = join(nested, "test.ts");
    await writeFile(filePath, "");

    const result = await findFilePaths({
      directory: TEST_DIR,
      extension: ".ts",
    });

    expect(result).toEqual([filePath]);
  });

  it("returns empty array for empty directory", async () => {
    const result = await findFilePaths({
      directory: TEST_DIR,
      extension: ".ts",
    });

    expect(result).toEqual([]);
  });
});
