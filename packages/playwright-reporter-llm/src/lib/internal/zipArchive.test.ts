import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createStoredZipArchive } from "./testHelpers";
import { readZipArchiveEntries } from "./zipArchive";

describe(readZipArchiveEntries, () => {
  let temporaryDirectory: string;

  beforeEach(() => {
    temporaryDirectory = mkdtempSync(path.join(tmpdir(), "zip-test-"));
  });

  afterEach(() => {
    rmSync(temporaryDirectory, { recursive: true, force: true });
  });

  it("reads entries from a valid stored ZIP", () => {
    const zipPath = path.join(temporaryDirectory, "test.zip");
    const archive = createStoredZipArchive([{ fileName: "hello.txt", content: "world" }]);
    // eslint-disable-next-line security/detect-non-literal-fs-filename
    writeFileSync(zipPath, archive);

    const entries = readZipArchiveEntries(zipPath);

    expect(Buffer.from(entries["hello.txt"]!).toString("utf8")).toBe("world");
  });

  it("rejects a buffer containing a false end-of-central-directory signature in file data", () => {
    const temporaryPath = path.join(temporaryDirectory, "false-end-record.bin");
    // Build a buffer that contains the end-of-central-directory signature bytes
    // inside file data but has no valid record at the end
    const falseSignature = Buffer.alloc(4);
    falseSignature.writeUInt32LE(101_010_256, 0);
    const garbage = Buffer.alloc(100, 0x42);
    // eslint-disable-next-line security/detect-non-literal-fs-filename
    writeFileSync(temporaryPath, Buffer.concat([falseSignature, garbage]));

    const entries = readZipArchiveEntries(temporaryPath);

    expect(entries).toStrictEqual({});
  });

  it("reads a ZIP with a non-zero comment length", () => {
    const temporaryPath = path.join(temporaryDirectory, "commented.zip");
    // Build a minimal valid ZIP with a comment appended to the end record
    const archive = createStoredZipArchive([{ fileName: "data.txt", content: "content" }]);
    // Patch the end-record comment length and append comment bytes
    const comment = Buffer.from("zip comment");
    const patched = Buffer.concat([archive, comment]);
    // The end record is at archive.length - 22; patch the comment length field at offset + 20
    const endRecordOffset = archive.length - 22;
    patched.writeUInt16LE(comment.length, endRecordOffset + 20);
    // eslint-disable-next-line security/detect-non-literal-fs-filename
    writeFileSync(temporaryPath, patched);

    const entries = readZipArchiveEntries(temporaryPath);

    expect(Buffer.from(entries["data.txt"]!).toString("utf8")).toBe("content");
  });

  it("returns empty for a non-ZIP file", () => {
    const temporaryPath = path.join(temporaryDirectory, "not-a-zip.txt");
    // eslint-disable-next-line security/detect-non-literal-fs-filename
    writeFileSync(temporaryPath, "this is not a zip");

    const entries = readZipArchiveEntries(temporaryPath);

    expect(entries).toStrictEqual({});
  });
});
