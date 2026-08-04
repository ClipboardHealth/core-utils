import { toStateName } from "./toStateName";
import { US_STATES } from "./usStates";

describe(toStateName, () => {
  it.each([
    { value: "California", expected: "California" },
    { value: "District of Columbia", expected: "District of Columbia" },
    { value: "New York", expected: "New York" },
  ])("maps the full name $value to $expected", ({ value, expected }) => {
    const actual = toStateName({ value });

    expect(actual).toBe(expected);
  });

  it.each([
    { value: "CA", expected: "California" },
    { value: "NY", expected: "New York" },
    { value: "DC", expected: "District of Columbia" },
  ])("maps the code $value to $expected", ({ value, expected }) => {
    const actual = toStateName({ value });

    expect(actual).toBe(expected);
  });

  it.each([
    { value: "california", expected: "California" },
    { value: "NEW YORK", expected: "New York" },
    { value: "ca", expected: "California" },
    { value: "district Of columbia", expected: "District of Columbia" },
  ])("is case-insensitive: $value to $expected", ({ value, expected }) => {
    const actual = toStateName({ value });

    expect(actual).toBe(expected);
  });

  it.each([
    { value: "  California  ", expected: "California" },
    { value: "\tNY\n", expected: "New York" },
    { value: " new york ", expected: "New York" },
  ])("trims surrounding whitespace: $value to $expected", ({ value, expected }) => {
    const actual = toStateName({ value });

    expect(actual).toBe(expected);
  });

  it.each([
    { value: "North  Dakota", expected: "North Dakota" },
    { value: "New\tHampshire", expected: "New Hampshire" },
    { value: "District  of\n Columbia", expected: "District of Columbia" },
  ])("collapses interior whitespace: $value to $expected", ({ value, expected }) => {
    const actual = toStateName({ value });

    expect(actual).toBe(expected);
  });

  it.each(["", "   ", "zz", "Atlantis", "USA", "C A"])(
    "returns undefined for the unknown value %j",
    (value) => {
      const actual = toStateName({ value });

      expect(actual).toBeUndefined();
    },
  );

  it.each(US_STATES)("resolves both the name and the code of $name to $name", ({ name, code }) => {
    const actual = [toStateName({ value: name }), toStateName({ value: code })];

    expect(actual).toStrictEqual([name, name]);
  });
});
