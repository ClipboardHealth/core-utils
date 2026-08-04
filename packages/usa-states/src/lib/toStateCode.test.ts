import { toStateCode, toStateCodeSet } from "./toStateCode";

describe(toStateCode, () => {
  it.each([
    { value: "California", expected: "CA" },
    { value: "District of Columbia", expected: "DC" },
    { value: "New York", expected: "NY" },
  ])("maps the full name $value to $expected", ({ value, expected }) => {
    const actual = toStateCode({ value });

    expect(actual).toBe(expected);
  });

  it.each([
    { value: "CA", expected: "CA" },
    { value: "NY", expected: "NY" },
  ])("maps the code $value to $expected", ({ value, expected }) => {
    const actual = toStateCode({ value });

    expect(actual).toBe(expected);
  });

  it.each([
    { value: "california", expected: "CA" },
    { value: "NEW YORK", expected: "NY" },
    { value: "ca", expected: "CA" },
    { value: "district of columbia", expected: "DC" },
  ])("is case-insensitive: $value to $expected", ({ value, expected }) => {
    const actual = toStateCode({ value });

    expect(actual).toBe(expected);
  });

  it.each([
    { value: "  California  ", expected: "CA" },
    { value: "\tNY\n", expected: "NY" },
    { value: " new york ", expected: "NY" },
  ])("trims surrounding whitespace: $value to $expected", ({ value, expected }) => {
    const actual = toStateCode({ value });

    expect(actual).toBe(expected);
  });

  it.each([
    { value: "North  Dakota", expected: "ND" },
    { value: "New\tHampshire", expected: "NH" },
    { value: "District  of\n Columbia", expected: "DC" },
  ])("collapses interior whitespace: $value to $expected", ({ value, expected }) => {
    const actual = toStateCode({ value });

    expect(actual).toBe(expected);
  });

  it.each(["", "   ", "zz", "Atlantis", "USA", "C A"])(
    "returns undefined for the unknown value %j",
    (value) => {
      const actual = toStateCode({ value });

      expect(actual).toBeUndefined();
    },
  );
});

describe(toStateCodeSet, () => {
  it("maps a list of names and codes to a Set of codes", () => {
    const values = ["California", "ny", " Texas "];

    const actual = toStateCodeSet({ values });

    expect(actual).toStrictEqual(new Set(["CA", "NY", "TX"]));
  });

  it("drops unknown values", () => {
    const values = ["California", "Atlantis", "", "NY"];

    const actual = toStateCodeSet({ values });

    expect(actual).toStrictEqual(new Set(["CA", "NY"]));
  });

  it("deduplicates names and codes that resolve to the same state", () => {
    const values = ["California", "ca", "CALIFORNIA"];

    const actual = toStateCodeSet({ values });

    expect(actual).toStrictEqual(new Set(["CA"]));
  });

  it("returns an empty Set for an empty list", () => {
    const values: string[] = [];

    const actual = toStateCodeSet({ values });

    expect(actual).toStrictEqual(new Set());
  });
});
