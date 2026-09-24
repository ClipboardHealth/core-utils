import { success } from "@clipboard-health/util-ts";

import { getLicenseTimeZone, STATE_TIME_ZONES, US_STATES } from "../index";

describe(getLicenseTimeZone, () => {
  it.each([
    { state: "Washington", expected: "America/Los_Angeles" },
    { state: "  wA\n", expected: "America/Los_Angeles" },
    { state: " new\t york ", expected: "America/New_York" },
    { state: "District  OF\nColumbia", expected: "America/New_York" },
    { state: "  hawaii ", expected: "Pacific/Honolulu" },
    { state: "Tennessee", expected: "America/New_York" },
    { state: "Arizona", expected: "America/Denver" },
    { state: "Oregon", expected: "America/Boise" },
    { state: "NV", expected: "America/Denver" },
    { state: "Federated States Of Micronesia", expected: "Pacific/Pohnpei" },
  ])("selects $expected for $state", ({ state, expected }) => {
    const actual = getLicenseTimeZone({ state });

    expect(actual).toStrictEqual(success({ licenseTimeZone: expected }));
  });

  it.each(US_STATES)("normalizes both the name and code of $name", ({ name, code }) => {
    const expected = success({ licenseTimeZone: STATE_TIME_ZONES[code][0] });

    const byName = getLicenseTimeZone({ state: `  ${name.toUpperCase()}  ` });
    const byCode = getLicenseTimeZone({ state: `\t${code.toLowerCase()}\n` });

    expect(byName).toStrictEqual(expected);
    expect(byCode).toStrictEqual(expected);
  });

  it.each([
    null,
    undefined,
    "",
    " \t ",
    "Any",
    " any ",
    "ZZ",
    "Atlantis",
    "USA",
    "__proto__",
    "constructor",
  ])("successfully returns no timezone for %j", (state) => {
    const actual = getLicenseTimeZone({ state });

    expect(actual).toStrictEqual(success({ licenseTimeZone: undefined }));
  });

  it("accepts an omitted issuing state", () => {
    const actual = getLicenseTimeZone({});

    expect(actual).toStrictEqual(success({ licenseTimeZone: undefined }));
  });
});
