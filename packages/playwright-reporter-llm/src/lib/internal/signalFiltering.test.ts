import { describe, expect, it } from "vitest";

import type { ConsoleEntry, NetworkRequest } from "../types";
import {
  appendConsoleEntryWithPriority,
  appendNetworkRequestWithPriority,
  canImproveConsoleSignal,
  canImproveNetworkSignal,
} from "./signalFiltering";

const CONSOLE_MESSAGES_CAP = 50;
const NETWORK_REQUESTS_CAP = 200;

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

describe(canImproveNetworkSignal, () => {
  it("returns true when below cap", () => {
    expect(canImproveNetworkSignal([])).toBe(true);
  });

  it("returns false at cap when all are high-signal", () => {
    const requests: NetworkRequest[] = Array.from({ length: NETWORK_REQUESTS_CAP }, (_, index) => ({
      method: "GET",
      url: `https://api.example.com/${index}`,
      status: 200,
      resourceType: "fetch",
    }));

    expect(canImproveNetworkSignal(requests)).toBe(false);
  });
});

describe(appendNetworkRequestWithPriority, () => {
  it("filters out successful static assets entirely", () => {
    const requests: NetworkRequest[] = [];
    const staticAsset: NetworkRequest = {
      method: "GET",
      url: "https://cdn.example.com/chunk.js",
      status: 200,
      resourceType: "script",
    };

    appendNetworkRequestWithPriority(requests, staticAsset);

    expect(requests).toHaveLength(0);
  });

  it("keeps static assets with error status codes", () => {
    const requests: NetworkRequest[] = [];
    const errorAsset: NetworkRequest = {
      method: "GET",
      url: "https://cdn.example.com/chunk.js",
      status: 500,
      resourceType: "script",
    };

    appendNetworkRequestWithPriority(requests, errorAsset);

    expect(requests).toHaveLength(1);
  });

  it("caps at 200 when all are high-signal", () => {
    const requests: NetworkRequest[] = Array.from({ length: NETWORK_REQUESTS_CAP }, (_, index) => ({
      method: "GET",
      url: `https://api.example.com/${index}`,
      status: 200,
      resourceType: "fetch",
    }));

    appendNetworkRequestWithPriority(requests, {
      method: "GET",
      url: "https://api.example.com/overflow",
      status: 200,
      resourceType: "fetch",
    });

    expect(requests).toHaveLength(NETWORK_REQUESTS_CAP);
  });
});
