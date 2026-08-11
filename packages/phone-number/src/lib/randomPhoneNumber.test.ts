import { isValidPhoneNumber } from "libphonenumber-js";

import { randomPhoneNumber } from "../index";

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

  it("uses only area-code and exchange ranges accepted by pinned phone metadata", () => {
    const areaCodeCount = 126;
    const random = vi.spyOn(Math, "random");
    const phoneNumbers = Array.from({ length: areaCodeCount }, (_, index) => {
      random.mockReturnValueOnce(index / areaCodeCount).mockReturnValueOnce(0);
      return randomPhoneNumber();
    });

    const areaCodes = new Set(phoneNumbers.map((phoneNumber) => phoneNumber.slice(0, 3)));
    const hasInvalidPhoneNumber = [...areaCodes].some((areaCode) =>
      Array.from({ length: 800 }, (_, index) => `${areaCode}${200 + index}0000`).some(
        (phoneNumber) => !isValidPhoneNumber(phoneNumber, "US"),
      ),
    );

    expect(areaCodes.size).toBe(areaCodeCount);
    expect(areaCodes.has("274")).toBe(false);
    expect(areaCodes.has("472")).toBe(false);
    expect(areaCodes.size * 8_000_000).toBe(1_008_000_000);
    expect(phoneNumbers.every((phoneNumber) => isValidPhoneNumber(phoneNumber, "US"))).toBe(true);
    expect(hasInvalidPhoneNumber).toBe(false);
  });

  it("includes the US country code when requested", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);

    const actual = randomPhoneNumber({ international: true });

    expect(actual).toBe("+12012000000");
    expect(isValidPhoneNumber(actual)).toBe(true);
  });
});
