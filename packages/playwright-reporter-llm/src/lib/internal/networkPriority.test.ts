import { isAbortFailureText, priorityScore } from "./networkPriority";

describe(isAbortFailureText, () => {
  it("matches plain net::ERR_ABORTED", () => {
    expect(isAbortFailureText("net::ERR_ABORTED")).toBe(true);
  });

  it("matches with trailing content after boundary", () => {
    expect(isAbortFailureText("net::ERR_ABORTED; reason=cancel")).toBe(true);
  });

  it("tolerates surrounding whitespace", () => {
    expect(isAbortFailureText("  net::ERR_ABORTED  ")).toBe(true);
  });

  it("is case-insensitive", () => {
    expect(isAbortFailureText("NET::ERR_ABORTED")).toBe(true);
  });

  it("rejects a longer identifier with underscore extension", () => {
    expect(isAbortFailureText("net::ERR_ABORTED_EXTENDED")).toBe(false);
  });

  it("rejects unrelated failure text", () => {
    expect(isAbortFailureText("net::ERR_CONNECTION_REFUSED")).toBe(false);
  });

  it("returns false when text is undefined", () => {
    expect(isAbortFailureText()).toBe(false);
  });
});

describe(priorityScore, () => {
  it("ranks status >= 500 as tier 10", () => {
    expect(priorityScore({ status: 500 })).toBe(10);
    expect(priorityScore({ status: 503, resourceType: "script" })).toBe(10);
  });

  it("ranks actionable failures (non-abort failureText) as tier 9", () => {
    expect(priorityScore({ status: -1, failureText: "net::ERR_CONNECTION_REFUSED" })).toBe(9);
    expect(priorityScore({ status: -1, failureText: "net::ERR_NAME_NOT_RESOLVED" })).toBe(9);
    expect(priorityScore({ status: 0, failureText: "net::ERR_TIMED_OUT" })).toBe(9);
  });

  it("ranks 4xx client errors as tier 8 regardless of resourceType", () => {
    expect(priorityScore({ status: 400 })).toBe(8);
    expect(priorityScore({ status: 404, resourceType: "script" })).toBe(8);
    expect(priorityScore({ status: 499, resourceType: "xhr" })).toBe(8);
  });

  it("ranks successful xhr/fetch as tier 6", () => {
    expect(priorityScore({ status: 200, resourceType: "xhr" })).toBe(6);
    expect(priorityScore({ status: 201, resourceType: "fetch" })).toBe(6);
  });

  it("ranks abort failureText/ERR_ABORTED as tier 4", () => {
    expect(priorityScore({ status: -1, failureText: "net::ERR_ABORTED" })).toBe(4);
    expect(priorityScore({ status: -1 })).toBe(4);
    expect(priorityScore({ status: 200, wasAborted: true })).toBe(4);
  });

  it("ranks unknown resourceType as tier 3", () => {
    expect(priorityScore({ status: 200 })).toBe(3);
  });

  it("ranks static assets as tier 1", () => {
    expect(priorityScore({ status: 200, resourceType: "script" })).toBe(1);
    expect(priorityScore({ status: 200, resourceType: "stylesheet" })).toBe(1);
    expect(priorityScore({ status: 200, resourceType: "image" })).toBe(1);
    expect(priorityScore({ status: 200, resourceType: "font" })).toBe(1);
    expect(priorityScore({ status: 200, resourceType: "media" })).toBe(1);
  });

  it("ranks other known resourceTypes as tier 2", () => {
    expect(priorityScore({ status: 200, resourceType: "document" })).toBe(2);
    expect(priorityScore({ status: 200, resourceType: "manifest" })).toBe(2);
  });

  it("server error beats client error", () => {
    expect(priorityScore({ status: 500 })).toBeGreaterThan(priorityScore({ status: 400 }));
  });

  it("connection failure (tier 9) beats 4xx (tier 8) but loses to 5xx (tier 10)", () => {
    const connectionRefused = priorityScore({
      status: -1,
      failureText: "net::ERR_CONNECTION_REFUSED",
    });
    expect(connectionRefused).toBeGreaterThan(priorityScore({ status: 400 }));
    expect(connectionRefused).toBeLessThan(priorityScore({ status: 500 }));
  });
});
