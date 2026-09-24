import { type StateCode, STATE_TIME_ZONES, US_STATES } from "../index";

const SPLIT_STATE_TIME_ZONES = [
  { state: "AK", expected: ["America/Anchorage", "America/Adak"] },
  { state: "AZ", expected: ["America/Denver", "America/Phoenix"] },
  { state: "FL", expected: ["America/New_York", "America/Chicago"] },
  { state: "ID", expected: ["America/Boise", "America/Los_Angeles"] },
  { state: "IN", expected: ["America/Indiana/Indianapolis", "America/Chicago"] },
  { state: "KS", expected: ["America/Chicago", "America/Denver"] },
  { state: "KY", expected: ["America/New_York", "America/Chicago"] },
  { state: "MI", expected: ["America/Detroit", "America/Menominee"] },
  { state: "NE", expected: ["America/Chicago", "America/Denver"] },
  { state: "NV", expected: ["America/Denver", "America/Los_Angeles"] },
  { state: "ND", expected: ["America/Chicago", "America/Denver"] },
  { state: "OR", expected: ["America/Boise", "America/Los_Angeles"] },
  { state: "SD", expected: ["America/Chicago", "America/Denver"] },
  { state: "TN", expected: ["America/New_York", "America/Chicago"] },
  { state: "TX", expected: ["America/Chicago", "America/Denver"] },
] satisfies Array<{ state: StateCode; expected: string[] }>;

const END_OF_DAY_FIXTURES = [
  { states: ["FL", "IN", "KY", "MI", "TN"], summer: "03:59:59Z", winter: "04:59:59Z" },
  { states: ["KS", "NE", "ND", "SD", "TX"], summer: "04:59:59Z", winter: "05:59:59Z" },
  { states: ["ID", "NV", "OR"], summer: "05:59:59Z", winter: "06:59:59Z" },
  { states: ["AK"], summer: "07:59:59Z", winter: "08:59:59Z" },
] satisfies Array<{ states: StateCode[]; summer: string; winter: string }>;

describe("STATE_TIME_ZONES", () => {
  it("covers exactly the supported states and territories", () => {
    const actual = Object.keys(STATE_TIME_ZONES).toSorted();

    expect(actual).toStrictEqual(US_STATES.map(({ code }) => code).toSorted());
  });

  it("freezes the shared mapping so consumers cannot change it", () => {
    expect(Object.isFrozen(STATE_TIME_ZONES)).toBe(true);
    expectTypeOf(STATE_TIME_ZONES.AZ).toEqualTypeOf<
      readonly ["America/Denver", "America/Phoenix"]
    >();
  });

  it.each(US_STATES)("provides frozen, unique IANA zones for $name", ({ code }) => {
    const actual = STATE_TIME_ZONES[code];

    expect(Object.isFrozen(actual)).toBe(true);
    expect(actual.length).toBeGreaterThan(0);
    expect(new Set(actual).size).toBe(actual.length);
    for (const timeZone of actual) {
      expect(timeZone).toMatch(/^(America|Pacific)\//u);
      expect(() => new Intl.DateTimeFormat("en-US", { timeZone })).not.toThrow();
    }
  });

  it.each(SPLIT_STATE_TIME_ZONES)(
    "preserves the timezone preference order for $state",
    ({ state, expected }) => {
      const actual = STATE_TIME_ZONES[state];

      expect(actual).toStrictEqual(expected);
    },
  );

  it.each([
    { state: "AS", expected: ["Pacific/Pago_Pago"] },
    { state: "FM", expected: ["Pacific/Pohnpei", "Pacific/Chuuk"] },
    { state: "GU", expected: ["Pacific/Guam"] },
    { state: "MH", expected: ["Pacific/Majuro"] },
    { state: "MP", expected: ["Pacific/Saipan"] },
    { state: "PR", expected: ["America/Puerto_Rico"] },
    { state: "PW", expected: ["Pacific/Palau"] },
    { state: "VI", expected: ["America/St_Thomas"] },
  ] satisfies Array<{ state: StateCode; expected: string[] }>)(
    "includes the representative territory zones for $state",
    ({ state, expected }) => {
      const actual = STATE_TIME_ZONES[state];

      expect(actual).toStrictEqual(expected);
    },
  );
});

describe("state timezone ordering against IANA rules", () => {
  describe.each(END_OF_DAY_FIXTURES)(
    "earlier end of day for $states",
    ({ states, summer, winter }) => {
      it.each([
        { date: "2026-01-16", endOfDay: winter, localDay: "15", month: "01" },
        { date: "2026-03-09", endOfDay: summer, localDay: "08", month: "03" },
        { date: "2026-07-02", endOfDay: summer, localDay: "01", month: "07" },
        { date: "2026-11-02", endOfDay: winter, localDay: "01", month: "11" },
      ])("uses the earlier end of day before $date", ({ date, endOfDay, localDay, month }) => {
        for (const state of states) {
          const [preferredTimeZone, ...alternatives] = STATE_TIME_ZONES[state];
          const instant = `${date}T${endOfDay}`;

          const actual = localParts({ instant, timeZone: preferredTimeZone });

          expect(actual).toMatchObject({
            month,
            day: localDay,
            hour: "23",
            minute: "59",
            second: "59",
          });
          for (const timeZone of alternatives) {
            expect(localParts({ instant, timeZone })).toMatchObject({
              month,
              day: localDay,
              hour: "22",
              minute: "59",
              second: "59",
            });
          }
        }
      });
    },
  );

  it.each([
    { instant: "2026-01-16T06:59:59Z", month: "01", day: "15", phoenixHour: "23" },
    { instant: "2026-03-09T05:59:59Z", month: "03", day: "08", phoenixHour: "22" },
    { instant: "2026-07-02T05:59:59Z", month: "07", day: "01", phoenixHour: "22" },
    { instant: "2026-11-02T06:59:59Z", month: "11", day: "01", phoenixHour: "23" },
  ])("prefers Arizona's DST-observing zone at $instant", ({ instant, month, day, phoenixHour }) => {
    const [preferredTimeZone, otherTimeZone] = STATE_TIME_ZONES.AZ;

    const preferred = localParts({ instant, timeZone: preferredTimeZone });
    const other = localParts({ instant, timeZone: otherTimeZone });

    expect(preferred).toMatchObject({ month, day, hour: "23", minute: "59", second: "59" });
    expect(other).toMatchObject({ month, day, hour: phoenixHour, minute: "59", second: "59" });
  });

  it.each([
    { instant: "2026-01-16T07:59:59Z", month: "01", day: "15" },
    { instant: "2026-09-27T06:59:59Z", month: "09", day: "26" },
  ])("resolves Washington's local calendar day at $instant", ({ instant, month, day }) => {
    const actual = localParts({ instant, timeZone: STATE_TIME_ZONES.WA[0] });

    expect(actual).toMatchObject({ month, day, hour: "23", minute: "59", second: "59" });
    expect(localParts({ instant, timeZone: STATE_TIME_ZONES.GA[0] })).toMatchObject({ hour: "02" });
  });

  it.each([
    { instant: "2026-03-08T09:59:59Z", hour: "01", minute: "59", second: "59" },
    { instant: "2026-03-08T10:00:00Z", hour: "03", minute: "00", second: "00" },
    { instant: "2026-11-01T08:59:59Z", hour: "01", minute: "59", second: "59" },
    { instant: "2026-11-01T09:00:00Z", hour: "01", minute: "00", second: "00" },
  ])("honors Washington's DST transition at $instant", ({ instant, hour, minute, second }) => {
    const actual = localParts({ instant, timeZone: STATE_TIME_ZONES.WA[0] });

    expect(actual).toMatchObject({ hour, minute, second });
  });

  it("prefers Micronesia's earlier end of day across the UTC date boundary", () => {
    const instant = "2026-07-01T12:59:59Z";
    const [preferredTimeZone, otherTimeZone] = STATE_TIME_ZONES.FM;

    const preferred = localParts({ instant, timeZone: preferredTimeZone });
    const other = localParts({ instant, timeZone: otherTimeZone });

    expect(preferred).toMatchObject({ day: "01", hour: "23", minute: "59", second: "59" });
    expect(other).toMatchObject({ day: "01", hour: "22", minute: "59", second: "59" });
  });
});

interface LocalPartsInput {
  instant: string;
  timeZone: string;
}

// Intl is an independent test oracle for geographic metadata.
function localParts(input: LocalPartsInput): Record<string, string> {
  const { instant, timeZone } = input;
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });

  return Object.fromEntries(
    formatter.formatToParts(new Date(instant)).map(({ type, value }) => [type, value]),
  );
}
