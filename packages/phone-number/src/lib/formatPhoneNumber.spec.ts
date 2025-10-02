import { expectToBeFailure, expectToBeSuccess } from "@clipboard-health/testing-core";

import { formatPhoneNumber, formatPhoneNumberOrThrow } from "./formatPhoneNumber";

const TEST_CASES = {
  valid: [
    { phoneNumber: "(555) 123-4567", name: "US phone number with parentheses" },
    { phoneNumber: "5551234567", name: "US phone number without special characters" },
    { phoneNumber: "1-555-123-4567", name: "phone number with country code" },
    { phoneNumber: "+44 20 7946 0958", name: "international phone number" },
    { phoneNumber: "12", name: "very short phone number (however impractical)" },
    {
      phoneNumber: "(555) 123-4567 ext 123",
      name: "phone numbers with extensions by ignoring extension",
    },
  ],
  invalid: [
    { phoneNumber: "invalid", name: "invalid phone number", expectedError: "NOT_A_NUMBER" },
    { phoneNumber: "", name: "empty string", expectedError: "NOT_A_NUMBER" },
    {
      phoneNumber: "123456789012345678901234567890",
      name: "too long phone number",
      expectedError: "TOO_LONG",
    },
  ],
} as const;

const EXPECTED_RESULTS = {
  "E.164": {
    "(555) 123-4567": "+15551234567",
    "5551234567": "+15551234567",
    "1-555-123-4567": "+15551234567",
    "+44 20 7946 0958": "+442079460958",
    "12": "+112",
    "(555) 123-4567 ext 123": "+15551234567",
  },
  humanReadable: {
    "(555) 123-4567": "(555) 123-4567",
    "5551234567": "(555) 123-4567",
    "1-555-123-4567": "(555) 123-4567",
    "+44 20 7946 0958": "020 7946 0958",
    "12": "12",
    "(555) 123-4567 ext 123": "(555) 123-4567 ext. 123",
  },
} as const;

describe("formatPhoneNumber", () => {
  describe.each(["E.164", "humanReadable"] as const)("with format %s", (format) => {
    it.each(TEST_CASES.valid)("should format valid $name", ({ phoneNumber }) => {
      const result = formatPhoneNumber({ phoneNumber, format });

      expectToBeSuccess(result);
      expect(result.value).toBe(EXPECTED_RESULTS[format][phoneNumber]);
    });

    it.each(TEST_CASES.invalid)(
      "should return error for $name",
      ({ phoneNumber, expectedError }) => {
        const result = formatPhoneNumber({ phoneNumber, format });

        expectToBeFailure(result);
        expect(result.error.issues).toHaveLength(1);
        expect(result.error.issues[0]!.message).toBe(expectedError);
        expect(result.error.issues[0]!.code).toBe("INVALID_PHONE_NUMBER");
      },
    );
  });
});

describe("formatPhoneNumberOrThrow", () => {
  describe.each(["E.164", "humanReadable"] as const)("with format %s", (format) => {
    it.each(TEST_CASES.valid)("should format valid $name", ({ phoneNumber }) => {
      const actual = formatPhoneNumberOrThrow({ phoneNumber, format });

      expect(actual).toBe(EXPECTED_RESULTS[format][phoneNumber]);
    });

    it.each(TEST_CASES.invalid)(
      "should throw error for $name",
      ({ phoneNumber, expectedError }) => {
        expect(() => {
          formatPhoneNumberOrThrow({ phoneNumber, format });
        }).toThrow(expectedError);
      },
    );
  });
});
