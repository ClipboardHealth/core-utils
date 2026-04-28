import { parseTraceparent } from "./traceparent";

describe(parseTraceparent, () => {
  it("parses a well-formed traceparent header", () => {
    expect(
      parseTraceparent("00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01"),
    ).toStrictEqual({
      traceId: "4bf92f3577b34da6a3ce929d0e0e4736",
      spanId: "00f067aa0ba902b7",
    });
  });

  it("normalizes case and trims whitespace", () => {
    expect(
      parseTraceparent("  00-4BF92F3577B34DA6A3CE929D0E0E4736-00F067AA0BA902B7-01  "),
    ).toStrictEqual({
      traceId: "4bf92f3577b34da6a3ce929d0e0e4736",
      spanId: "00f067aa0ba902b7",
    });
  });

  it("returns undefined for undefined input", () => {
    expect(parseTraceparent()).toBeUndefined();
  });

  it("returns undefined for an empty string", () => {
    expect(parseTraceparent("")).toBeUndefined();
  });

  it("rejects malformed traceparent (wrong shape)", () => {
    expect(parseTraceparent("not-a-valid-traceparent")).toBeUndefined();
  });

  it("rejects traceparent with non-hex characters", () => {
    expect(
      parseTraceparent("00-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx-00f067aa0ba902b7-01"),
    ).toBeUndefined();
  });

  it("rejects all-zero trace id", () => {
    expect(
      parseTraceparent("00-00000000000000000000000000000000-00f067aa0ba902b7-01"),
    ).toBeUndefined();
  });

  it("rejects all-zero span id", () => {
    expect(
      parseTraceparent("00-4bf92f3577b34da6a3ce929d0e0e4736-0000000000000000-01"),
    ).toBeUndefined();
  });

  it("rejects invalid `ff` version", () => {
    expect(
      parseTraceparent("ff-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01"),
    ).toBeUndefined();
  });

  it("rejects truncated traceparent", () => {
    expect(parseTraceparent("00-4bf92f3577b34da6a3ce929d0e0e4736")).toBeUndefined();
  });

  it("rejects traceparent with wrong-length trace id", () => {
    expect(
      parseTraceparent("00-4bf92f3577b34da6a3ce929d0e0e473-00f067aa0ba902b7-01"),
    ).toBeUndefined();
  });

  it("rejects traceparent with wrong-length span id", () => {
    expect(
      parseTraceparent("00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b-01"),
    ).toBeUndefined();
  });
});
