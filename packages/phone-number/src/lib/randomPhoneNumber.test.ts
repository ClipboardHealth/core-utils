import { isValidPhoneNumber } from "libphonenumber-js";

import { randomPhoneNumber } from "../index";

const AREA_CODE_COUNT = 126;

describe("randomPhoneNumber", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("covers the full-width subscriber-number range", () => {
    vi.spyOn(Math, "random")
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(1 - Number.EPSILON)
      .mockReturnValueOnce(1 - Number.EPSILON);

    const actual = [randomPhoneNumber(), randomPhoneNumber()];

    expect(actual).toStrictEqual(["2012000000", "4759999999"]);
    expect(actual.every((phoneNumber) => isValidPhoneNumber(phoneNumber, "US"))).toBe(true);
  });

  it("uses distinct area codes accepted by pinned phone metadata", () => {
    const random = vi.spyOn(Math, "random");
    const phoneNumbers = Array.from({ length: AREA_CODE_COUNT }, (_, index) => {
      random.mockReturnValueOnce(index / AREA_CODE_COUNT).mockReturnValueOnce(0);
      return randomPhoneNumber();
    });

    const areaCodes = new Set(phoneNumbers.map((phoneNumber) => phoneNumber.slice(0, 3)));

    expect(areaCodes.size).toBe(AREA_CODE_COUNT);
    expect(areaCodes.has("274")).toBe(false);
    expect(areaCodes.has("472")).toBe(false);
    expect(areaCodes.size * 8_000_000).toBe(1_008_000_000);
    expect(phoneNumbers.every((phoneNumber) => isValidPhoneNumber(phoneNumber, "US"))).toBe(true);
  });

  it.each(Array.from({ length: AREA_CODE_COUNT }, (_, index) => index))(
    "accepts every exchange for area-code index %i",
    (index) => {
      vi.spyOn(Math, "random")
        .mockReturnValueOnce(index / AREA_CODE_COUNT)
        .mockReturnValueOnce(0);
      const areaCode = randomPhoneNumber().slice(0, 3);

      const actual = Array.from(
        { length: 800 },
        (_, exchange) => `${areaCode}${200 + exchange}0000`,
      );

      expect(actual.every((phoneNumber) => isValidPhoneNumber(phoneNumber, "US"))).toBe(true);
    },
  );

  it("includes the US country code when requested", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);

    const actual = randomPhoneNumber({ international: true });

    expect(actual).toBe("+12012000000");
    expect(isValidPhoneNumber(actual)).toBe(true);
  });
});
