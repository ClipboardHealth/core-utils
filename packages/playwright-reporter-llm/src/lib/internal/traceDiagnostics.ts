import path from "node:path";

import type { TestResult } from "@playwright/test/reporter";

import type { ConsoleEntry, NetworkReport, TestAttachment } from "../types";
import { buildConsoleEntryFromEvent } from "./consoleProcessing";
import { NetworkBuilder } from "./networkBuilder";
import { buildNetworkObservationFromEvent } from "./networkProcessing";
import { appendConsoleEntryWithPriority } from "./signalFiltering";
import { extractMonotonicAnchor, type MonotonicAnchor } from "./traceTiming";
import { asRecord } from "./typeGuards";
import { readZipArchiveEntries } from "./zipArchive";

interface TraceDiagnostics {
  network: NetworkReport;
  consoleMessages: ConsoleEntry[];
}

interface AttachmentsCollection {
  attachments: TestAttachment[];
  tracePaths: string[];
}

interface TraceParseContext {
  archiveEntries: Record<string, Uint8Array>;
  anchor: MonotonicAnchor | undefined;
  attemptStartTimeMs: number;
  builder: NetworkBuilder;
  consoleMessages: ConsoleEntry[];
}

function parseTraceLine(line: string, context: TraceParseContext): void {
  let parsedLine: unknown;
  try {
    parsedLine = JSON.parse(line);
  } catch {
    return;
  }

  const eventRecord = asRecord(parsedLine);
  if (!eventRecord) {
    return;
  }

  const observation = buildNetworkObservationFromEvent({
    eventRecord,
    archiveEntries: context.archiveEntries,
    anchor: context.anchor,
    attemptStartTimeMs: context.attemptStartTimeMs,
  });
  if (observation) {
    context.builder.admit(observation);
  }

  const consoleEntry = buildConsoleEntryFromEvent(
    eventRecord,
    context.anchor,
    context.attemptStartTimeMs,
  );
  if (consoleEntry) {
    appendConsoleEntryWithPriority(context.consoleMessages, consoleEntry);
  }
}

function parseTraceIntoBuilder(
  tracePath: string,
  attemptStartTimeMs: number,
  builder: NetworkBuilder,
  consoleMessages: ConsoleEntry[],
): void {
  let archiveEntries: Record<string, Uint8Array>;

  try {
    archiveEntries = readZipArchiveEntries(tracePath);
  } catch {
    return;
  }

  let anchor: MonotonicAnchor | undefined;
  for (const [entryName, entryContent] of Object.entries(archiveEntries)) {
    if (!entryName.endsWith(".trace")) {
      continue;
    }
    try {
      const entryText = Buffer.from(entryContent).toString("utf8");
      anchor = extractMonotonicAnchor(entryText);
      if (anchor) {
        break;
      }
    } catch {
      continue;
    }
  }

  const context: TraceParseContext = {
    archiveEntries,
    anchor,
    attemptStartTimeMs,
    builder,
    consoleMessages,
  };

  for (const [entryName, entryContent] of Object.entries(archiveEntries)) {
    try {
      if (!entryName.endsWith(".trace") && !entryName.endsWith(".network")) {
        continue;
      }

      const entryText = Buffer.from(entryContent).toString("utf8");
      const lines = entryText.split("\n");

      for (const line of lines) {
        if (!line.trim()) {
          continue;
        }

        try {
          parseTraceLine(line, context);
        } catch {
          continue;
        }
      }
    } catch {
      continue;
    }
  }
}

export function collectAttachments(
  result: TestResult,
  outputDirectory: string,
): AttachmentsCollection {
  const attachments: TestAttachment[] = [];
  const tracePaths: string[] = [];

  for (const attachment of result.attachments) {
    const contentType = attachment.contentType ?? "application/octet-stream";
    attachments.push({
      name: attachment.name,
      contentType,
      ...(attachment.path && { path: path.relative(outputDirectory, attachment.path) }),
    });

    if (
      contentType === "application/zip" &&
      attachment.path &&
      attachment.name.toLowerCase().includes("trace")
    ) {
      tracePaths.push(attachment.path);
    }
  }

  return { attachments, tracePaths };
}

export function collectTraceDiagnosticsFromAttachments(
  tracePaths: string[],
  attemptStartTimeMs: number,
): TraceDiagnostics {
  const builder = new NetworkBuilder();
  const consoleMessages: ConsoleEntry[] = [];

  for (const tracePath of tracePaths) {
    parseTraceIntoBuilder(tracePath, attemptStartTimeMs, builder, consoleMessages);
  }

  return { network: builder.finalize(), consoleMessages };
}
