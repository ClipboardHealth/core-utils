import { isStateCode } from "./isStateCode";
import { US_STATES } from "./usStates";

describe(isStateCode, () => {
  it.each(US_STATES)("returns true for the real code $code ($name)", ({ code }) => {
    const actual = isStateCode(code);

    expect(actual).toBe(true);
  });

  it.each(["ca", "zz", "", "California", "C A"])("returns false for %j", (value) => {
    const actual = isStateCode(value);

    expect(actual).toBe(false);
  });
});
