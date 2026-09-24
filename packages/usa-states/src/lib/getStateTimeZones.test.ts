import { getStateTimeZones, STATE_TIME_ZONES, US_STATES } from "../index";

describe(getStateTimeZones, () => {
  it.each([
    { state: "Washington", expected: ["America/Los_Angeles"] },
    { state: "  wA\n", expected: ["America/Los_Angeles"] },
    { state: " new\t york ", expected: ["America/New_York"] },
    { state: "District  OF\nColumbia", expected: ["America/New_York"] },
    { state: "  hawaii ", expected: ["Pacific/Honolulu"] },
    { state: "Tennessee", expected: ["America/New_York", "America/Chicago"] },
    { state: "Arizona", expected: ["America/Denver", "America/Phoenix"] },
    { state: "Oregon", expected: ["America/Boise", "America/Los_Angeles"] },
    { state: "NV", expected: ["America/Denver", "America/Los_Angeles"] },
    { state: "Federated States Of Micronesia", expected: ["Pacific/Pohnpei", "Pacific/Chuuk"] },
  ])("returns all zones in policy order for $state", ({ state, expected }) => {
    const actual = getStateTimeZones({ state });

    expect(actual).toStrictEqual(expected);
    expect(Object.isFrozen(actual)).toBe(true);
  });

  it.each(US_STATES)("normalizes both the name and code of $name", ({ name, code }) => {
    const expected = STATE_TIME_ZONES[code];

    const byName = getStateTimeZones({ state: `  ${name.toUpperCase()}  ` });
    const byCode = getStateTimeZones({ state: `\t${code.toLowerCase()}\n` });

    expect(byName).toStrictEqual(expected);
    expect(byCode).toStrictEqual(expected);
  });

  it.each(["", " \t ", "Any", " any ", "ZZ", "Atlantis", "USA", "__proto__", "constructor"])(
    "returns a frozen empty array for %j",
    (state) => {
      const actual = getStateTimeZones({ state });

      expect(actual).toStrictEqual([]);
      expect(Object.isFrozen(actual)).toBe(true);
    },
  );

  it("returns a frozen empty array for an omitted state", () => {
    const actual = getStateTimeZones({});

    expect(actual).toStrictEqual([]);
    expect(Object.isFrozen(actual)).toBe(true);
  });

  it("exposes an optional state and a readonly array", () => {
    expectTypeOf(getStateTimeZones).toEqualTypeOf<
      (input: { state?: string }) => readonly string[]
    >();
  });
});
