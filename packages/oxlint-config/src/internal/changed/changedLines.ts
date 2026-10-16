export type AddedLines = ReadonlyMap<string, ReadonlySet<number>>;

export interface OxlintDiagnostic {
  code: string;
  filename: string;
  labels: ReadonlyArray<{
    span: { column: number; length: number; line: number; offset: number };
  }>;
  message: string;
  severity: string;
}

export interface ChangedDiagnostic {
  code: string;
  column: number;
  filename: string;
  line: number;
  message: string;
}

const FILE_HEADER = /^\+\+\+ (?:b\/(?<path>.+)|\/dev\/null)$/;
const HUNK_HEADER = /^@@ -\d+(?:,\d+)? \+(?<start>\d+)(?:,(?<count>\d+))? @@/;

/** Parses `git diff --unified=0` output into the new-side line numbers each file adds. */
export function parseAddedLines(params: { diff: string }): AddedLines {
  const { diff } = params;
  const added = new Map<string, Set<number>>();
  let currentLines: Set<number> | undefined;

  for (const line of diff.split("\n")) {
    const file = FILE_HEADER.exec(line);
    if (file) {
      const filePath = file.groups?.["path"];
      currentLines =
        filePath === undefined ? undefined : getOrCreate({ map: added, key: filePath });
      continue;
    }

    const hunk = HUNK_HEADER.exec(line);
    if (hunk && currentLines) {
      const start = Number(hunk.groups?.["start"]);
      const count = Number(hunk.groups?.["count"] ?? "1");
      for (let lineNumber = start; lineNumber < start + count; lineNumber += 1) {
        currentLines.add(lineNumber);
      }
    }
  }

  return new Map([...added].filter(([, lines]) => lines.size > 0));
}

/** Keeps diagnostics whose primary span touches an added line. Span offsets are UTF-8 bytes. */
export function filterChangedDiagnostics(params: {
  addedLines: AddedLines;
  diagnostics: readonly OxlintDiagnostic[];
  readFile: (filePath: string) => Buffer;
}): ChangedDiagnostic[] {
  const { addedLines, diagnostics, readFile } = params;
  const fileBytes = new Map<string, Buffer>();
  const kept: ChangedDiagnostic[] = [];

  for (const diagnostic of diagnostics) {
    const span = diagnostic.labels[0]?.span;
    const lines = addedLines.get(diagnostic.filename);
    if (span === undefined || lines === undefined) {
      continue;
    }

    let bytes = fileBytes.get(diagnostic.filename);
    if (bytes === undefined) {
      bytes = readFile(diagnostic.filename);
      fileBytes.set(diagnostic.filename, bytes);
    }

    const spannedBytes = bytes.subarray(span.offset, span.offset + span.length);
    const endLine = span.line + countNewlines({ bytes: spannedBytes });

    if (hasAddedLine({ lines, start: span.line, end: endLine })) {
      kept.push({
        code: diagnostic.code,
        column: span.column,
        filename: diagnostic.filename,
        line: span.line,
        message: diagnostic.message,
      });
    }
  }

  return kept;
}

function getOrCreate(params: { key: string; map: Map<string, Set<number>> }): Set<number> {
  const { key, map } = params;
  const existing = map.get(key);
  if (existing) {
    return existing;
  }

  const created = new Set<number>();
  map.set(key, created);
  return created;
}

const NEWLINE_BYTE = 0x0a;

function countNewlines(params: { bytes: Buffer }): number {
  let count = 0;
  for (const byte of params.bytes) {
    if (byte === NEWLINE_BYTE) {
      count += 1;
    }
  }

  return count;
}

function hasAddedLine(params: { end: number; lines: ReadonlySet<number>; start: number }): boolean {
  const { end, lines, start } = params;
  for (let lineNumber = start; lineNumber <= end; lineNumber += 1) {
    if (lines.has(lineNumber)) {
      return true;
    }
  }

  return false;
}
