import { expectToBeFailure, expectToBeSuccess } from "@clipboard-health/testing-core";

import { formatPhoneNumber } from "./formatPhoneNumber";

describe("formatPhoneNumber", () => {
  describe.each([
    {
      format: "E.164" as const,
      expectedResults: {
        usPhoneWithParens: "+15551234567",
        usPhoneWithoutSpecialChars: "+15551234567",
        usPhoneWithCountryCode: "+15551234567",
        internationalPhone: "+442079460958",
        shortPhone: "+112",
        phoneWithExtension: "+15551234567",
      },
    },
    {
      format: "humanReadable" as const,
      expectedResults: {
        usPhoneWithParens: "(555) 123-4567",
        usPhoneWithoutSpecialChars: "(555) 123-4567",
        usPhoneWithCountryCode: "(555) 123-4567",
        internationalPhone: "020 7946 0958",
        shortPhone: "12",
        phoneWithExtension: "(555) 123-4567 ext. 123",
      },
    },
  ])("with format $format", ({ format, expectedResults }) => {
    it("should format valid US phone number with parentheses", () => {
      const result = formatPhoneNumber({ phoneNumber: "(555) 123-4567", format });

      expectToBeSuccess(result);
      expect(result.value).toBe(expectedResults.usPhoneWithParens);
    });

    it("should format valid US phone number without special characters", () => {
      const result = formatPhoneNumber({ phoneNumber: "5551234567", format });

      expectToBeSuccess(result);
      expect(result.value).toBe(expectedResults.usPhoneWithoutSpecialChars);
    });

    it("should format valid phone number with country code", () => {
      const result = formatPhoneNumber({ phoneNumber: "1-555-123-4567", format });

      expectToBeSuccess(result);
      expect(result.value).toBe(expectedResults.usPhoneWithCountryCode);
    });

    it("should format valid international phone number", () => {
      const result = formatPhoneNumber({ phoneNumber: "+44 20 7946 0958", format });

      expectToBeSuccess(result);
      expect(result.value).toBe(expectedResults.internationalPhone);
    });

    it("should format very short phone number (however impractical)", () => {
      const result = formatPhoneNumber({ phoneNumber: "12", format });

      expectToBeSuccess(result);
      expect(result.value).toBe(expectedResults.shortPhone);
    });

    it("should format phone numbers with extensions by ignoring extension", () => {
      const result = formatPhoneNumber({ phoneNumber: "(555) 123-4567 ext 123", format });

      expectToBeSuccess(result);
      expect(result.value).toBe(expectedResults.phoneWithExtension);
    });

    it("should return error for invalid phone number", () => {
      const result = formatPhoneNumber({ phoneNumber: "invalid", format });

      expectToBeFailure(result);
      expect(result.error.issues).toHaveLength(1);
      expect(result.error.issues[0]!.message).toBe("Invalid phone number");
      expect(result.error.issues[0]!.code).toBe("INVALID_PHONE_NUMBER");
    });

    it("should return error for empty string", () => {
      const result = formatPhoneNumber({ phoneNumber: "", format });

      expectToBeFailure(result);
      expect(result.error.issues).toHaveLength(1);
      expect(result.error.issues[0]!.message).toBe("Invalid phone number");
      expect(result.error.issues[0]!.code).toBe("INVALID_PHONE_NUMBER");
    });

    it("should return error for too long phone number", () => {
      const result = formatPhoneNumber({
        phoneNumber: "123456789012345678901234567890",
        format,
      });

      expectToBeFailure(result);
      expect(result.error.issues).toHaveLength(1);
      expect(result.error.issues[0]!.message).toBe("Invalid phone number");
      expect(result.error.issues[0]!.code).toBe("INVALID_PHONE_NUMBER");
    });
  });
});
