import path from "node:path";

import type { TestResult } from "@playwright/test/reporter";

import type { ConsoleEntry, NetworkRequest, TestAttachment } from "../types";
import { buildConsoleEntryFromEvent } from "./consoleProcessing";
import { annotateRedirectChains, buildNetworkRequestFromEvent } from "./networkProcessing";
import {
  appendConsoleEntryWithPriority,
  appendNetworkRequestWithPriority,
  canImproveConsoleSignal,
  canImproveNetworkSignal,
} from "./signalFiltering";
import { extractMonotonicAnchor, type MonotonicAnchor } from "./traceTiming";
import { asRecord } from "./typeGuards";
import { readZipArchiveEntries } from "./zipArchive";

interface TraceLineDiagnostics {
  networkRequest?: NetworkRequest;
  consoleEntry?: ConsoleEntry;
}

interface TraceDiagnostics {
  networkRequests: NetworkRequest[];
  consoleMessages: ConsoleEntry[];
}

interface AttachmentsCollection {
  attachments: TestAttachment[];
  tracePaths: string[];
}

function parseTraceLine(
  line: string,
  archiveEntries: Record<string, Uint8Array>,
  anchor: MonotonicAnchor | undefined,
  attemptStartTimeMs: number,
): TraceLineDiagnostics | undefined {
  let parsedLine: unknown;
  try {
    parsedLine = JSON.parse(line);
  } catch {
    return undefined;
  }

  const eventRecord = asRecord(parsedLine);
  if (!eventRecord) {
    return undefined;
  }

  const traceLineDiagnostics: TraceLineDiagnostics = {};
  const networkRequest = buildNetworkRequestFromEvent(
    eventRecord,
    archiveEntries,
    anchor,
    attemptStartTimeMs,
  );
  if (networkRequest) {
    traceLineDiagnostics.networkRequest = networkRequest;
  }

  const consoleEntry = buildConsoleEntryFromEvent(eventRecord, anchor, attemptStartTimeMs);
  if (consoleEntry) {
    traceLineDiagnostics.consoleEntry = consoleEntry;
  }

  if (!traceLineDiagnostics.networkRequest && !traceLineDiagnostics.consoleEntry) {
    return undefined;
  }

  return traceLineDiagnostics;
}

function parseTraceDiagnostics(tracePath: string, attemptStartTimeMs: number): TraceDiagnostics {
  const networkRequests: NetworkRequest[] = [];
  const consoleMessages: ConsoleEntry[] = [];
  let archiveEntries: Record<string, Uint8Array>;

  try {
    archiveEntries = readZipArchiveEntries(tracePath);
  } catch {
    return { networkRequests, consoleMessages };
  }

  // First pass: extract monotonic anchor from .trace files
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

  // Second pass: parse events
  for (const [entryName, entryContent] of Object.entries(archiveEntries)) {
    if (!canImproveNetworkSignal(networkRequests) && !canImproveConsoleSignal(consoleMessages)) {
      break;
    }

    try {
      if (!entryName.endsWith(".trace") && !entryName.endsWith(".network")) {
        continue;
      }

      const entryText = Buffer.from(entryContent).toString("utf8");
      const lines = entryText.split("\n");

      for (const line of lines) {
        if (
          !canImproveNetworkSignal(networkRequests) &&
          !canImproveConsoleSignal(consoleMessages)
        ) {
          break;
        }
        if (!line.trim()) {
          continue;
        }

        let traceLineDiagnostics: TraceLineDiagnostics | undefined;
        try {
          traceLineDiagnostics = parseTraceLine(line, archiveEntries, anchor, attemptStartTimeMs);
        } catch {
          continue;
        }
        if (!traceLineDiagnostics) {
          continue;
        }

        if (traceLineDiagnostics.networkRequest) {
          appendNetworkRequestWithPriority(networkRequests, traceLineDiagnostics.networkRequest);
        }
        if (traceLineDiagnostics.consoleEntry) {
          appendConsoleEntryWithPriority(consoleMessages, traceLineDiagnostics.consoleEntry);
        }
      }
    } catch {
      continue;
    }
  }

  return { networkRequests, consoleMessages };
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
  const networkRequests: NetworkRequest[] = [];
  const consoleMessages: ConsoleEntry[] = [];

  for (const tracePath of tracePaths) {
    if (!canImproveNetworkSignal(networkRequests) && !canImproveConsoleSignal(consoleMessages)) {
      break;
    }

    const traceDiagnostics = parseTraceDiagnostics(tracePath, attemptStartTimeMs);
    for (const request of traceDiagnostics.networkRequests) {
      appendNetworkRequestWithPriority(networkRequests, request);
    }

    for (const consoleEntry of traceDiagnostics.consoleMessages) {
      appendConsoleEntryWithPriority(consoleMessages, consoleEntry);
    }
  }

  annotateRedirectChains(networkRequests);
  return { networkRequests, consoleMessages };
}
