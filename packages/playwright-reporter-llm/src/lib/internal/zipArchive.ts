import { readFileSync } from "node:fs";
import { inflateRawSync } from "node:zlib";

const ZIP_END_OF_CENTRAL_DIRECTORY_SIGNATURE = 101_010_256;
const ZIP_CENTRAL_DIRECTORY_FILE_HEADER_SIGNATURE = 33_639_248;
const ZIP_LOCAL_FILE_HEADER_SIGNATURE = 67_324_752;
const ZIP_COMPRESSION_STORED = 0;
const ZIP_COMPRESSION_DEFLATE = 8;

function findEndOfCentralDirectoryOffset(zipBuffer: Buffer): number {
  const minimumEndRecordLength = 22;
  const maxCommentLength = 65_535;
  const minimumOffset = Math.max(0, zipBuffer.length - minimumEndRecordLength - maxCommentLength);

  for (let offset = zipBuffer.length - minimumEndRecordLength; offset >= minimumOffset; offset--) {
    if (zipBuffer.readUInt32LE(offset) === ZIP_END_OF_CENTRAL_DIRECTORY_SIGNATURE) {
      return offset;
    }
  }

  return -1;
}

export function readZipArchiveEntries(zipPath: string): Record<string, Uint8Array> {
  // eslint-disable-next-line security/detect-non-literal-fs-filename
  const zipBuffer = readFileSync(zipPath);
  const endOfCentralDirectoryOffset = findEndOfCentralDirectoryOffset(zipBuffer);
  if (endOfCentralDirectoryOffset < 0) {
    return {};
  }

  const centralDirectoryEntries = zipBuffer.readUInt16LE(endOfCentralDirectoryOffset + 10);
  const centralDirectoryOffset = zipBuffer.readUInt32LE(endOfCentralDirectoryOffset + 16);
  const archiveEntries: Record<string, Uint8Array> = {};

  let cursor = centralDirectoryOffset;
  for (let index = 0; index < centralDirectoryEntries; index++) {
    if (cursor + 46 > zipBuffer.length) {
      break;
    }
    if (zipBuffer.readUInt32LE(cursor) !== ZIP_CENTRAL_DIRECTORY_FILE_HEADER_SIGNATURE) {
      break;
    }

    const compressionMethod = zipBuffer.readUInt16LE(cursor + 10);
    const compressedSize = zipBuffer.readUInt32LE(cursor + 20);
    const fileNameLength = zipBuffer.readUInt16LE(cursor + 28);
    const extraFieldLength = zipBuffer.readUInt16LE(cursor + 30);
    const fileCommentLength = zipBuffer.readUInt16LE(cursor + 32);
    const localHeaderOffset = zipBuffer.readUInt32LE(cursor + 42);

    const fileNameStart = cursor + 46;
    const fileNameEnd = fileNameStart + fileNameLength;
    if (fileNameEnd > zipBuffer.length) {
      break;
    }
    const fileName = zipBuffer.subarray(fileNameStart, fileNameEnd).toString("utf8");

    if (localHeaderOffset + 30 > zipBuffer.length) {
      cursor += 46 + fileNameLength + extraFieldLength + fileCommentLength;
      continue;
    }
    if (zipBuffer.readUInt32LE(localHeaderOffset) !== ZIP_LOCAL_FILE_HEADER_SIGNATURE) {
      cursor += 46 + fileNameLength + extraFieldLength + fileCommentLength;
      continue;
    }

    const localFileNameLength = zipBuffer.readUInt16LE(localHeaderOffset + 26);
    const localExtraFieldLength = zipBuffer.readUInt16LE(localHeaderOffset + 28);
    const compressedDataStart =
      localHeaderOffset + 30 + localFileNameLength + localExtraFieldLength;
    const compressedDataEnd = compressedDataStart + compressedSize;
    if (compressedDataEnd > zipBuffer.length) {
      cursor += 46 + fileNameLength + extraFieldLength + fileCommentLength;
      continue;
    }

    const compressedData = zipBuffer.subarray(compressedDataStart, compressedDataEnd);
    let entryContent: Buffer | undefined;

    if (compressionMethod === ZIP_COMPRESSION_STORED) {
      entryContent = Buffer.from(compressedData);
    } else if (compressionMethod === ZIP_COMPRESSION_DEFLATE) {
      try {
        entryContent = inflateRawSync(compressedData);
      } catch {
        cursor += 46 + fileNameLength + extraFieldLength + fileCommentLength;
        continue;
      }
    }

    if (entryContent) {
      archiveEntries[fileName] = new Uint8Array(entryContent);
    }

    cursor += 46 + fileNameLength + extraFieldLength + fileCommentLength;
  }

  return archiveEntries;
}
