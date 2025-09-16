import { redact } from "./redact";

describe("redact", () => {
  it("returns undefined when data is undefined", () => {
    const actual = redact({
      data: undefined,
      keysToRedact: ["secret"],
    });

    expect(actual).toBeUndefined();
  });

  it("returns the same data when no keys to redact", () => {
    const input = { public: "visible", another: "also visible" };

    const actual = redact({
      data: input,
      keysToRedact: [],
    });

    expect(actual).toEqual(input);
  });

  it("redacts specified keys", () => {
    const input = {
      public: "visible",
      secret: "should-be-hidden",
      another: "also visible",
    };

    const actual = redact({
      data: input,
      keysToRedact: ["secret"],
    });

    expect(actual).toEqual({
      public: "visible",
      secret: "[REDACTED]",
      another: "also visible",
    });
  });

  it("redacts array elements", () => {
    const input = {
      secrets: ["secret1", "secret2"],
      public: ["public1"],
    };

    const actual = redact({
      data: input,
      keysToRedact: ["secrets"],
    });

    expect(actual).toEqual({
      secrets: "[REDACTED]",
      public: ["public1"],
    });
  });

  it("handles null values", () => {
    const input = {
      secret: null,
      public: "visible",
    };

    const actual = redact({
      data: input,
      keysToRedact: ["secret"],
    });

    expect(actual).toEqual({
      secret: "[REDACTED]",
      public: "visible",
    });
  });

  it("handles undefined values", () => {
    const input = {
      secret: undefined,
      public: "visible",
    };

    const actual = redact({
      data: input,
      keysToRedact: ["secret"],
    });

    expect(actual).toEqual({
      secret: "[REDACTED]",
      public: "visible",
    });
  });

  it("redacts deeply nested objects", () => {
    const input = {
      level1: {
        level2: {
          secret: "hidden",
          public: "visible",
        },
      },
    };

    const actual = redact({
      data: input,
      keysToRedact: ["secret"],
    });

    expect(actual).toEqual({
      level1: {
        level2: {
          secret: "[REDACTED]",
          public: "visible",
        },
      },
    });
  });

  it("handles empty arrays", () => {
    const input = {
      secret: [],
      public: "visible",
    };

    const actual = redact({
      data: input,
      keysToRedact: ["secret"],
    });

    expect(actual).toEqual({
      secret: "[REDACTED]",
      public: "visible",
    });
  });

  it("redacts multiple keys", () => {
    const input = {
      secret1: "hidden1",
      public: "visible",
      secret2: "hidden2",
      another: "also visible",
    };

    const actual = redact({
      data: input,
      keysToRedact: ["secret1", "secret2"],
    });

    expect(actual).toEqual({
      secret1: "[REDACTED]",
      public: "visible",
      secret2: "[REDACTED]",
      another: "also visible",
    });
  });

  it("redacts keys in arrays of objects", () => {
    const input = {
      items: [
        { secret: "hidden1", public: "visible1" },
        { secret: "hidden2", public: "visible2" },
      ],
    };

    const actual = redact({
      data: input,
      keysToRedact: ["secret"],
    });

    expect(actual).toEqual({
      items: [
        { secret: "[REDACTED]", public: "visible1" },
        { secret: "[REDACTED]", public: "visible2" },
      ],
    });
  });

  it("handles mixed array content", () => {
    const input = {
      mixed: ["string", { secret: "hidden", public: "visible" }, 123, null, undefined],
    };

    const actual = redact({
      data: input,
      keysToRedact: ["secret"],
    });

    expect(actual).toEqual({
      mixed: ["string", { secret: "[REDACTED]", public: "visible" }, 123, null, undefined],
    });
  });
});
