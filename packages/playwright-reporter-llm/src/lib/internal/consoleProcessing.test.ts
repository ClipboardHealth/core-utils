import { describe, expect, it } from "vitest";

import { buildConsoleEntryFromEvent } from "./consoleProcessing";
import type { MonotonicAnchor } from "./traceTiming";

const ANCHOR: MonotonicAnchor = { wallTimeMs: 1_000_000, monotonicTimeMs: 5000 };
const ATTEMPT_START_MS = 1_000_000;

describe(buildConsoleEntryFromEvent, () => {
  it("builds warning console entry", () => {
    const event = { type: "console", messageType: "warning", text: "deprecated API" };

    const result = buildConsoleEntryFromEvent(event, undefined, 0);

    expect(result).toStrictEqual({ type: "warning", text: "deprecated API" });
  });

  it("builds error console entry", () => {
    const event = { type: "console", messageType: "error", text: "failed to fetch" };

    const result = buildConsoleEntryFromEvent(event, undefined, 0);

    expect(result).toStrictEqual({ type: "error", text: "failed to fetch" });
  });

  it("ignores log and info messages", () => {
    expect(
      buildConsoleEntryFromEvent({ type: "console", messageType: "log", text: "hi" }, undefined, 0),
    ).toBeUndefined();
    expect(
      buildConsoleEntryFromEvent(
        { type: "console", messageType: "info", text: "hi" },
        undefined,
        0,
      ),
    ).toBeUndefined();
  });

  it("builds pageerror entry from string error", () => {
    const event = { type: "event", method: "pageError", params: { error: "page exploded" } };

    const result = buildConsoleEntryFromEvent(event, undefined, 0);

    expect(result).toStrictEqual({ type: "pageerror", text: "page exploded" });
  });

  it("builds pageerror entry from object error with message", () => {
    const event = {
      type: "event",
      method: "pageError",
      params: { error: { message: "Uncaught TypeError" } },
    };

    const result = buildConsoleEntryFromEvent(event, undefined, 0);

    expect(result).toStrictEqual({ type: "pageerror", text: "Uncaught TypeError" });
  });

  it("builds page-closed entry", () => {
    const event = { type: "event", method: "pageClosed", params: { pageId: "page-1" } };

    const result = buildConsoleEntryFromEvent(event, undefined, 0);

    expect(result).toStrictEqual({ type: "page-closed", text: "Page closed" });
  });

  it("builds page-crashed entry", () => {
    const event = {
      type: "event",
      method: "pageCrashed",
      params: { error: "Target page crashed" },
    };

    const result = buildConsoleEntryFromEvent(event, undefined, 0);

    expect(result).toStrictEqual({ type: "page-crashed", text: "Target page crashed" });
  });

  it("builds page-crashed entry with pageCrash method variant", () => {
    const event = { type: "event", method: "pageCrash", params: { error: "crash" } };

    const result = buildConsoleEntryFromEvent(event, undefined, 0);

    expect(result?.type).toBe("page-crashed");
  });

  it("includes offsetMs when anchor is available", () => {
    const event = { type: "console", messageType: "error", text: "err", time: 5200 };

    const result = buildConsoleEntryFromEvent(event, ANCHOR, ATTEMPT_START_MS);

    expect(result?.offsetMs).toBe(200);
  });

  it("omits offsetMs when anchor is unavailable", () => {
    const event = { type: "console", messageType: "error", text: "err", time: 5200 };

    const result = buildConsoleEntryFromEvent(event, undefined, 0);

    expect(result?.offsetMs).toBeUndefined();
  });

  it("returns undefined for unrecognized event types", () => {
    expect(buildConsoleEntryFromEvent({ type: "unknown" }, undefined, 0)).toBeUndefined();
  });

  it("strips ANSI from text", () => {
    const event = {
      type: "console",
      messageType: "error",
      text: `\u001B[31mred error\u001B[39m`, // cspell:disable-line
    };

    const result = buildConsoleEntryFromEvent(event, undefined, 0);

    expect(result?.text).toBe("red error");
  });
});
