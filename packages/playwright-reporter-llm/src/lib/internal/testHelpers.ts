import { writeFileSync } from "node:fs";
import path from "node:path";
import { deflateRawSync } from "node:zlib";

interface ZipFixtureEntry {
  fileName: string;
  content: string | Buffer;
  compressionMethod?: 0 | 8;
}

function createStoredZipArchive(entries: ZipFixtureEntry[]): Buffer {
  const localFileParts: Buffer[] = [];
  const centralDirectoryParts: Buffer[] = [];
  let localFileOffset = 0;

  for (const entry of entries) {
    const fileName = Buffer.from(entry.fileName, "utf8");
    const fileContent = Buffer.isBuffer(entry.content)
      ? entry.content
      : Buffer.from(entry.content, "utf8");
    const compressionMethod = entry.compressionMethod ?? 0;
    const compressedContent =
      compressionMethod === 8 ? deflateRawSync(fileContent) : Buffer.from(fileContent);
    const contentCrc32 = 0;

    const localFileHeader = Buffer.alloc(30);
    localFileHeader.writeUInt32LE(67_324_752, 0);
    localFileHeader.writeUInt16LE(20, 4);
    localFileHeader.writeUInt16LE(0, 6);
    localFileHeader.writeUInt16LE(compressionMethod, 8);
    localFileHeader.writeUInt16LE(0, 10);
    localFileHeader.writeUInt16LE(0, 12);
    localFileHeader.writeUInt32LE(contentCrc32, 14);
    localFileHeader.writeUInt32LE(compressedContent.length, 18);
    localFileHeader.writeUInt32LE(fileContent.length, 22);
    localFileHeader.writeUInt16LE(fileName.length, 26);
    localFileHeader.writeUInt16LE(0, 28);

    localFileParts.push(localFileHeader, fileName, compressedContent);

    const centralDirectoryHeader = Buffer.alloc(46);
    centralDirectoryHeader.writeUInt32LE(33_639_248, 0);
    centralDirectoryHeader.writeUInt16LE(20, 4);
    centralDirectoryHeader.writeUInt16LE(20, 6);
    centralDirectoryHeader.writeUInt16LE(0, 8);
    centralDirectoryHeader.writeUInt16LE(compressionMethod, 10);
    centralDirectoryHeader.writeUInt16LE(0, 12);
    centralDirectoryHeader.writeUInt16LE(0, 14);
    centralDirectoryHeader.writeUInt32LE(contentCrc32, 16);
    centralDirectoryHeader.writeUInt32LE(compressedContent.length, 20);
    centralDirectoryHeader.writeUInt32LE(fileContent.length, 24);
    centralDirectoryHeader.writeUInt16LE(fileName.length, 28);
    centralDirectoryHeader.writeUInt16LE(0, 30);
    centralDirectoryHeader.writeUInt16LE(0, 32);
    centralDirectoryHeader.writeUInt16LE(0, 34);
    centralDirectoryHeader.writeUInt16LE(0, 36);
    centralDirectoryHeader.writeUInt32LE(0, 38);
    centralDirectoryHeader.writeUInt32LE(localFileOffset, 42);

    centralDirectoryParts.push(centralDirectoryHeader, fileName);

    localFileOffset += localFileHeader.length + fileName.length + compressedContent.length;
  }

  const centralDirectory = Buffer.concat(centralDirectoryParts);
  const endOfCentralDirectoryRecord = Buffer.alloc(22);
  endOfCentralDirectoryRecord.writeUInt32LE(101_010_256, 0);
  endOfCentralDirectoryRecord.writeUInt16LE(0, 4);
  endOfCentralDirectoryRecord.writeUInt16LE(0, 6);
  endOfCentralDirectoryRecord.writeUInt16LE(entries.length, 8);
  endOfCentralDirectoryRecord.writeUInt16LE(entries.length, 10);
  endOfCentralDirectoryRecord.writeUInt32LE(centralDirectory.length, 12);
  endOfCentralDirectoryRecord.writeUInt32LE(localFileOffset, 16);
  endOfCentralDirectoryRecord.writeUInt16LE(0, 20);

  return Buffer.concat([...localFileParts, centralDirectory, endOfCentralDirectoryRecord]);
}

interface WriteTraceZipFixtureInput {
  requestBody: string;
  responseBody: string;
  traceEvents?: unknown[];
  networkEvents?: unknown[];
  traceRawLines?: string[];
  useDeflateCompression?: boolean;
  contextOptions?: { wallTimeMs: number; monotonicTimeMs: number };
}

export function writeTraceZipFixture(
  fixtureDirectory: string,
  fileName: string,
  input: WriteTraceZipFixtureInput,
): string {
  const {
    requestBody,
    responseBody,
    traceEvents = [],
    networkEvents,
    traceRawLines = [],
    useDeflateCompression = false,
    contextOptions,
  } = input;
  const traceLines = [...traceEvents.map((event) => JSON.stringify(event)), ...traceRawLines];
  if (contextOptions) {
    traceLines.unshift(
      JSON.stringify({
        type: "context-options",
        wallTime: contextOptions.wallTimeMs,
        monotonicTime: contextOptions.monotonicTimeMs,
      }),
    );
  }
  const resolvedNetworkEvents = networkEvents ?? [
    {
      type: "resource-snapshot",
      snapshot: {
        time: 37,
        _resourceType: "fetch",
        request: {
          method: "POST",
          url: "https://api.example.com/v1/orders",
          postData: { mimeType: "application/json", _sha1: "request-body.json" },
        },
        response: {
          status: 201,
          content: { mimeType: "application/json", _sha1: "response-body.json" },
        },
        timings: { send: 10, wait: 20, receive: 7 },
      },
    },
  ];
  const entryCompressionMethod = useDeflateCompression ? 8 : 0;

  const archive = createStoredZipArchive([
    {
      fileName: "test.trace",
      content: `${traceLines.join("\n")}${traceLines.length > 0 ? "\n" : ""}`,
      compressionMethod: entryCompressionMethod,
    },
    {
      fileName: "test.network",
      content: `${resolvedNetworkEvents.map((event) => JSON.stringify(event)).join("\n")}\n`,
      compressionMethod: entryCompressionMethod,
    },
    {
      fileName: "resources/request-body.json",
      content: requestBody,
      compressionMethod: entryCompressionMethod,
    },
    {
      fileName: "resources/response-body.json",
      content: responseBody,
      compressionMethod: entryCompressionMethod,
    },
  ]);

  const tracePath = path.join(fixtureDirectory, fileName);
  // eslint-disable-next-line security/detect-non-literal-fs-filename
  writeFileSync(tracePath, archive);
  return tracePath;
}
