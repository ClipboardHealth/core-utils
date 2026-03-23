import { isUsPhoneNumber } from "./isUsPhoneNumber";

const TEST_CASES = {
  valid: [
    { phoneNumber: "2125551234", name: "US phone number" },
    { phoneNumber: "+12125551234", name: "US phone number with +1 prefix" },
    { phoneNumber: "7872034310", name: "Puerto Rico phone number (787)" },
    { phoneNumber: "+17872034310", name: "Puerto Rico phone number with +1 prefix" },
    { phoneNumber: "6711234567", name: "Guam phone number (671)" },
    { phoneNumber: "3401234567", name: "US Virgin Islands phone number (340)" },
    { phoneNumber: "6841234567", name: "American Samoa phone number (684)" },
    { phoneNumber: "6701234567", name: "Northern Mariana Islands phone number (670)" },
  ],
  invalid: [
    { phoneNumber: "123", name: "too short" },
    { phoneNumber: "notaphone", name: "non-numeric" },
    { phoneNumber: "", name: "empty string" },
  ],
  nonUs: [
    { phoneNumber: "+14165551234", name: "Canadian phone number (Toronto 416)" },
    { phoneNumber: "+16045551234", name: "Canadian phone number (Vancouver 604)" },
    { phoneNumber: "+442079460958", name: "UK phone number" },
    { phoneNumber: "+4930123456", name: "German phone number" },
  ],
} as const;

describe("isUsPhoneNumber", () => {
  it.each(TEST_CASES.valid)("should return true for $name", ({ phoneNumber }) => {
    const actual = isUsPhoneNumber({ phoneNumber });

    expect(actual).toBe(true);
  });

  it.each(TEST_CASES.invalid)("should return false for $name", ({ phoneNumber }) => {
    const actual = isUsPhoneNumber({ phoneNumber });

    expect(actual).toBe(false);
  });

  it.each(TEST_CASES.nonUs)("should return false for non-US $name", ({ phoneNumber }) => {
    const actual = isUsPhoneNumber({ phoneNumber });

    expect(actual).toBe(false);
  });
});
