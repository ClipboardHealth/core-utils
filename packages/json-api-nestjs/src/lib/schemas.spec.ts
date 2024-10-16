import { expectToBeError, expectToBeSuccess } from "../test";
import { booleanString, nonEmptyString, toBoolean } from "./schemas";

describe("nonEmptyString", () => {
  it("accepts non-empty string", () => {
    const input = "hi";

    const actual = nonEmptyString.safeParse(input);

    expectToBeSuccess(actual);
    expect(actual.data).toBe(input);
  });

  it("rejects empty string", () => {
    const input = "";

    const actual = nonEmptyString.safeParse(input);

    expectToBeError(actual);
    expect(actual.error.message).toContain("String must contain at least 1 character(s)");
  });

  it("rejects non-string input", () => {
    const input = 123;

    const actual = nonEmptyString.safeParse(input);

    expectToBeError(actual);
    expect(actual.error.message).toContain("Expected string, received number");
  });
});

describe("booleanString", () => {
  it("transforms 'true' to boolean true", () => {
    const input = "true";

    const actual = booleanString.safeParse(input);

    expectToBeSuccess(actual);
    expect(actual.data).toBe("true");
  });

  it("transforms 'false' to boolean false", () => {
    const input = "false";

    const actual = booleanString.safeParse(input);

    expectToBeSuccess(actual);
    expect(actual.data).toBe("false");
  });

  it("rejects invalid string input", () => {
    const input = "invalid";

    const actual = booleanString.safeParse(input);

    expectToBeError(actual);
    expect(actual.error.message).toContain(
      "Invalid enum value. Expected 'true' | 'false', received 'invalid'",
    );
  });

  it("rejects non-string input", () => {
    const input = true;

    const actual = booleanString.safeParse(input);

    expectToBeError(actual);
    expect(actual.error.message).toContain("Expected 'true' | 'false', received boolean");
  });
});

describe("toBoolean", () => {
  it("converts 'true' to boolean true", () => {
    const actual = toBoolean("true");

    expect(actual).toBe(true);
  });

  it("converts 'false' to boolean false", () => {
    const actual = toBoolean("false");

    expect(actual).toBe(false);
  });
});
