import { type StateCode, type StateName, US_STATES } from "./usStates";

const TERRITORY_CODES = ["AS", "FM", "GU", "MH", "MP", "PR", "PW", "VI"] as const;

describe("US_STATES", () => {
  it("has 59 entries: 50 states + DC + 8 territories", () => {
    const actual = US_STATES.length;

    expect(actual).toBe(59);
  });

  it("has a unique code for every entry", () => {
    const codes = US_STATES.map((state) => state.code);

    const actual = new Set(codes).size;

    expect(actual).toBe(codes.length);
  });

  it("has a unique name for every entry", () => {
    const names = US_STATES.map((state) => state.name);

    const actual = new Set(names).size;

    expect(actual).toBe(names.length);
  });

  it.each(US_STATES)("has a 2-letter uppercase code for $name ($code)", ({ code }) => {
    const actual = code;

    expect(actual).toMatch(/^[A-Z]{2}$/);
  });

  it("includes the District of Columbia", () => {
    const actual = US_STATES;

    expect(actual).toContainEqual({ name: "District of Columbia", code: "DC" });
  });

  it.each(TERRITORY_CODES)("includes the territory with code %s", (code) => {
    const actual = US_STATES.some((state) => state.code === code);

    expect(actual).toBe(true);
  });

  it("derives a StateCode literal type from the code field", () => {
    const code: StateCode = "CA";

    const actual = US_STATES.some((state) => state.code === code);

    expect(actual).toBe(true);
  });

  it("derives a StateName literal type from the name field", () => {
    const name: StateName = "California";

    const actual = US_STATES.some((state) => state.name === name);

    expect(actual).toBe(true);
  });
});
