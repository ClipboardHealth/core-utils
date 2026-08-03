import { toStateCode, toStateCodeSet } from "./toStateCode";

describe(toStateCode, () => {
  it.each([
    { input: "California", expected: "CA" },
    { input: "District of Columbia", expected: "DC" },
    { input: "New York", expected: "NY" },
  ])("maps the full name $input to $expected", ({ input, expected }) => {
    const actual = toStateCode(input);

    expect(actual).toBe(expected);
  });

  it.each([
    { input: "CA", expected: "CA" },
    { input: "NY", expected: "NY" },
  ])("maps the code $input to $expected", ({ input, expected }) => {
    const actual = toStateCode(input);

    expect(actual).toBe(expected);
  });

  it.each([
    { input: "california", expected: "CA" },
    { input: "NEW YORK", expected: "NY" },
    { input: "ca", expected: "CA" },
    { input: "district of columbia", expected: "DC" },
  ])("is case-insensitive: $input to $expected", ({ input, expected }) => {
    const actual = toStateCode(input);

    expect(actual).toBe(expected);
  });

  it.each([
    { input: "  California  ", expected: "CA" },
    { input: "\tNY\n", expected: "NY" },
    { input: " new york ", expected: "NY" },
  ])("trims surrounding whitespace: $input to $expected", ({ input, expected }) => {
    const actual = toStateCode(input);

    expect(actual).toBe(expected);
  });

  it.each([
    { input: "North  Dakota", expected: "ND" },
    { input: "New\tHampshire", expected: "NH" },
    { input: "District  of\n Columbia", expected: "DC" },
  ])("collapses interior whitespace: $input to $expected", ({ input, expected }) => {
    const actual = toStateCode(input);

    expect(actual).toBe(expected);
  });

  it.each(["", "   ", "zz", "Atlantis", "USA", "C A"])(
    "returns undefined for the unknown value %j",
    (input) => {
      const actual = toStateCode(input);

      expect(actual).toBeUndefined();
    },
  );
});

describe(toStateCodeSet, () => {
  it("maps a list of names and codes to a Set of codes", () => {
    const input = ["California", "ny", " Texas "];

    const actual = toStateCodeSet(input);

    expect(actual).toStrictEqual(new Set(["CA", "NY", "TX"]));
  });

  it("drops unknown values", () => {
    const input = ["California", "Atlantis", "", "NY"];

    const actual = toStateCodeSet(input);

    expect(actual).toStrictEqual(new Set(["CA", "NY"]));
  });

  it("deduplicates names and codes that resolve to the same state", () => {
    const input = ["California", "ca", "CALIFORNIA"];

    const actual = toStateCodeSet(input);

    expect(actual).toStrictEqual(new Set(["CA"]));
  });

  it("returns an empty Set for an empty list", () => {
    const input: string[] = [];

    const actual = toStateCodeSet(input);

    expect(actual).toStrictEqual(new Set());
  });
});
