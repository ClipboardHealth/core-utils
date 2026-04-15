import type { ConsoleEntry } from "../types";
import { capConsoleMessageText, stripAnsi } from "./textProcessing";
import { type MonotonicAnchor, monotonicToOffsetMs } from "./traceTiming";
import { asNumber, asRecord, asString } from "./typeGuards";

function extractPageErrorText(eventRecord: Record<string, unknown>): string | undefined {
  const paramsRecord = asRecord(eventRecord["params"]);
  if (!paramsRecord) {
    return undefined;
  }

  const { error } = paramsRecord;
  const errorAsText = asString(error);
  if (errorAsText) {
    return errorAsText;
  }

  const errorRecord = asRecord(error);
  return asString(errorRecord?.["message"]);
}

function computeConsoleOffsetMs(
  eventRecord: Record<string, unknown>,
  anchor: MonotonicAnchor | undefined,
  attemptStartTimeMs: number,
): number | undefined {
  const time = asNumber(eventRecord["time"]);
  if (time !== undefined && anchor) {
    return monotonicToOffsetMs(time, anchor, attemptStartTimeMs);
  }
  return undefined;
}

export function buildConsoleEntryFromEvent(
  eventRecord: Record<string, unknown>,
  anchor: MonotonicAnchor | undefined,
  attemptStartTimeMs: number,
): ConsoleEntry | undefined {
  const offsetMs = computeConsoleOffsetMs(eventRecord, anchor, attemptStartTimeMs);

  if (eventRecord["type"] === "console") {
    const messageType = asString(eventRecord["messageType"])?.toLowerCase();
    if (messageType !== "warning" && messageType !== "error") {
      return undefined;
    }

    const text = asString(eventRecord["text"]);
    if (!text) {
      return undefined;
    }

    return {
      type: messageType,
      text: capConsoleMessageText(stripAnsi(text)),
      ...(offsetMs !== undefined && { offsetMs }),
    };
  }

  if (eventRecord["type"] === "event" && eventRecord["method"] === "pageError") {
    const pageErrorText = extractPageErrorText(eventRecord);
    if (!pageErrorText) {
      return undefined;
    }

    return {
      type: "pageerror",
      text: capConsoleMessageText(stripAnsi(pageErrorText)),
      ...(offsetMs !== undefined && { offsetMs }),
    };
  }

  if (eventRecord["type"] === "event" && eventRecord["method"] === "pageClosed") {
    return {
      type: "page-closed",
      text: "Page closed",
      ...(offsetMs !== undefined && { offsetMs }),
    };
  }

  if (
    eventRecord["type"] === "event" &&
    (eventRecord["method"] === "pageCrashed" || eventRecord["method"] === "pageCrash")
  ) {
    const pageCrashText = extractPageErrorText(eventRecord) ?? "Page crashed";
    return {
      type: "page-crashed",
      text: capConsoleMessageText(stripAnsi(pageCrashText)),
      ...(offsetMs !== undefined && { offsetMs }),
    };
  }

  return undefined;
}
