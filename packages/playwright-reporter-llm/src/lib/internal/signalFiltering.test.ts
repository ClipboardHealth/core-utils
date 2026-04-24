import type { ConsoleEntry } from "../types";
import {
  appendConsoleEntryWithPriority,
  canImproveConsoleSignal,
  isLowSignalStaticAsset,
} from "./signalFiltering";

const CONSOLE_MESSAGES_CAP = 50;

describe(canImproveConsoleSignal, () => {
  it("returns true when below cap", () => {
    expect(canImproveConsoleSignal([])).toBe(true);
  });

  it("returns true at cap when low-signal entries exist", () => {
    const messages: ConsoleEntry[] = [
      { type: "page-closed", text: "msg-0" },
      ...Array.from({ length: CONSOLE_MESSAGES_CAP - 1 }, (_, index) => ({
        type: "error",
        text: `msg-${index + 1}`,
      })),
    ];

    expect(canImproveConsoleSignal(messages)).toBe(true);
  });

  it("returns false at cap when all are high-signal", () => {
    const messages: ConsoleEntry[] = Array.from({ length: CONSOLE_MESSAGES_CAP }, (_, index) => ({
      type: "error",
      text: `msg-${index}`,
    }));

    expect(canImproveConsoleSignal(messages)).toBe(false);
  });
});

describe(appendConsoleEntryWithPriority, () => {
  it("appends when below cap", () => {
    const messages: ConsoleEntry[] = [];

    appendConsoleEntryWithPriority(messages, { type: "error", text: "err" });

    expect(messages).toHaveLength(1);
  });

  it("replaces low-signal with high-signal at cap", () => {
    const messages: ConsoleEntry[] = Array.from({ length: CONSOLE_MESSAGES_CAP }, () => ({
      type: "page-closed",
      text: "Page closed",
    }));

    appendConsoleEntryWithPriority(messages, { type: "error", text: "critical" });

    expect(messages).toHaveLength(CONSOLE_MESSAGES_CAP);
    expect(messages).toContainEqual({ type: "error", text: "critical" });
    expect(messages.filter((m) => m.type === "page-closed")).toHaveLength(CONSOLE_MESSAGES_CAP - 1);
  });

  it("drops low-signal entry at cap", () => {
    const messages: ConsoleEntry[] = Array.from({ length: CONSOLE_MESSAGES_CAP }, () => ({
      type: "error",
      text: "err",
    }));

    appendConsoleEntryWithPriority(messages, { type: "page-closed", text: "Page closed" });

    expect(messages).toHaveLength(CONSOLE_MESSAGES_CAP);
    expect(messages.some((m) => m.type === "page-closed")).toBe(false);
  });
});

describe(isLowSignalStaticAsset, () => {
  it("flags successful static assets", () => {
    expect(isLowSignalStaticAsset({ status: 200, resourceType: "script" })).toBe(true);
    expect(isLowSignalStaticAsset({ status: 200, resourceType: "stylesheet" })).toBe(true);
    expect(isLowSignalStaticAsset({ status: 200, resourceType: "image" })).toBe(true);
    expect(isLowSignalStaticAsset({ status: 304, resourceType: "script" })).toBe(true);
  });

  it("keeps static assets with 4xx/5xx status", () => {
    expect(isLowSignalStaticAsset({ status: 404, resourceType: "script" })).toBe(false);
    expect(isLowSignalStaticAsset({ status: 500, resourceType: "image" })).toBe(false);
  });

  it("keeps static assets with failureText", () => {
    expect(
      isLowSignalStaticAsset({
        status: 200,
        resourceType: "script",
        failureText: "net::ERR_FAILED",
      }),
    ).toBe(false);
  });

  it("keeps static assets that were aborted", () => {
    expect(isLowSignalStaticAsset({ status: 200, resourceType: "script", wasAborted: true })).toBe(
      false,
    );
  });

  it("does not flag xhr/fetch or unknown types", () => {
    expect(isLowSignalStaticAsset({ status: 200, resourceType: "fetch" })).toBe(false);
    expect(isLowSignalStaticAsset({ status: 200, resourceType: "xhr" })).toBe(false);
    expect(isLowSignalStaticAsset({ status: 200 })).toBe(false);
  });
});
