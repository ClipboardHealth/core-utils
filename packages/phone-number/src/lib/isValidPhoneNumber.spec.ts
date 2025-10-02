import { isValidPhoneNumber } from "./isValidPhoneNumber";

const TEST_CASES = {
  valid: [
    { phoneNumber: "(212) 555-1234", name: "US phone number with parentheses" },
    { phoneNumber: "2125551234", name: "US phone number without special characters" },
    { phoneNumber: "1-212-555-1234", name: "phone number with country code" },
    { phoneNumber: "+1 212-555-1234", name: "phone number with +1 country code" },
    { phoneNumber: " (212) 555-1234 ", name: "phone number with leading/trailing whitespace" },
    { phoneNumber: "+44 20 7946 0958", name: "international phone number" },
  ],
  invalid: [
    { phoneNumber: "invalid", name: "invalid phone number" },
    { phoneNumber: "", name: "empty string" },
    { phoneNumber: "   ", name: "whitespace only" },
    { phoneNumber: "123", name: "too short phone number" },
    { phoneNumber: "123456789012345678901234567890", name: "too long phone number" },
    { phoneNumber: "abc-def-ghi", name: "alphabetic characters" },
  ],
} as const;

describe("isValidPhoneNumber", () => {
  it.each(TEST_CASES.valid)("should return true for $name", ({ phoneNumber }) => {
    const actual = isValidPhoneNumber({ phoneNumber });

    expect(actual).toBe(true);
  });

  it.each(TEST_CASES.invalid)("should return false for $name", ({ phoneNumber }) => {
    const actual = isValidPhoneNumber({ phoneNumber });

    expect(actual).toBe(false);
  });
});
