import { LinearClient } from "@linear/sdk";

import { captureConsoleLog } from "../testHelpers/consoleCapture.js";
import { deleteEnvironmentVariable, setEnvironmentVariable } from "../testHelpers/env.js";
import {
  errorMessage,
  getLinearClient,
  log,
  logEvent,
  readEnvironmentVariable,
  sleep,
} from "./util.js";

describe(sleep, () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("resolves only after the timer fully elapses", async () => {
    const delayMs = 500;
    const tracker = vi.fn<() => void>();
    const settled = sleep(delayMs).then(tracker);

    await vi.advanceTimersByTimeAsync(delayMs - 1);
    expect(tracker).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    await settled;
    expect(tracker).toHaveBeenCalledTimes(1);
  });

  it("resolves early when the abort signal fires mid-wait", async () => {
    const controller = new AbortController();
    const tracker = vi.fn<() => void>();
    const settled = sleep(60_000, controller.signal).then(tracker);

    await vi.advanceTimersByTimeAsync(1);
    expect(tracker).not.toHaveBeenCalled();

    controller.abort();
    await settled;

    expect(tracker).toHaveBeenCalledTimes(1);
  });

  it("returns immediately when the abort signal is already aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    const tracker = vi.fn<() => void>();

    await sleep(60_000, controller.signal).then(tracker);

    expect(tracker).toHaveBeenCalledTimes(1);
  });
});

describe(log, () => {
  it("prefixes the message with a bracketed timestamp", () => {
    const consoleLog = captureConsoleLog();

    log("hello world");

    expect(consoleLog.calls).toHaveLength(1);
    expect(consoleLog.output()).toMatch(/^\[.+] hello world$/);
    consoleLog.restore();
  });
});

describe(logEvent, () => {
  it("prints stable key-value fields and skips undefined fields", () => {
    const consoleLog = captureConsoleLog();

    logEvent("dispatch", {
      outcome: "skipped",
      reason: "blocked",
      empty: undefined,
      blockers: ["TEAM-1:In Progress"],
    });

    expect(consoleLog.output()).toBe(
      'event=dispatch outcome=skipped reason=blocked blockers="TEAM-1:In Progress"',
    );
    consoleLog.restore();
  });
});

describe(getLinearClient, () => {
  const originalKey = readEnvironmentVariable("LINEAR_API_KEY");

  afterEach(() => {
    if (originalKey === undefined) {
      deleteEnvironmentVariable("LINEAR_API_KEY");
    } else {
      setEnvironmentVariable("LINEAR_API_KEY", originalKey);
    }
  });

  it("returns a LinearClient when LINEAR_API_KEY is set", () => {
    setEnvironmentVariable("LINEAR_API_KEY", "lin_api_test");

    const actual = getLinearClient();

    expect(actual).toBeInstanceOf(LinearClient);
  });

  it("throws when LINEAR_API_KEY is missing", () => {
    deleteEnvironmentVariable("LINEAR_API_KEY");

    expect(() => getLinearClient()).toThrow(/LINEAR_API_KEY not set/);
  });

  it("throws when LINEAR_API_KEY is empty", () => {
    setEnvironmentVariable("LINEAR_API_KEY", "");

    expect(() => getLinearClient()).toThrow(/LINEAR_API_KEY not set/);
  });
});

describe(errorMessage, () => {
  it("returns the message of an Error", () => {
    expect(errorMessage(new Error("boom"))).toBe("boom");
  });

  it("returns the string when given a string", () => {
    expect(errorMessage("nope")).toBe("nope");
  });

  it("JSON-stringifies plain objects", () => {
    expect(errorMessage({ a: 1, b: "two" })).toBe('{"a":1,"b":"two"}');
  });

  it("falls back to Object.prototype.toString when JSON fails", () => {
    const circular: Record<string, unknown> = {};
    circular["self"] = circular;

    const actual = errorMessage(circular);

    expect(actual).toBe("[object Object]");
  });
});
