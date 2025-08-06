import { expectToBeLeft, expectToBeRight } from "@clipboard-health/testing-core";

import { formatPhoneAsE164 } from "./formatPhoneAsE164";

describe("formatPhoneAsE164", () => {
  it("should format valid US phone number to E.164 format", () => {
    const result = formatPhoneAsE164({ phone: "(555) 123-4567" });

    expectToBeRight(result);
    expect(result.right).toBe("+15551234567");
  });

  it("should format valid US phone number without special characters to E.164", () => {
    const result = formatPhoneAsE164({ phone: "5551234567" });

    expectToBeRight(result);
    expect(result.right).toBe("+15551234567");
  });

  it("should format valid phone number with country code to E.164", () => {
    const result = formatPhoneAsE164({ phone: "1-555-123-4567" });

    expectToBeRight(result);
    expect(result.right).toBe("+15551234567");
  });

  it("should format valid international phone number to E.164", () => {
    const result = formatPhoneAsE164({ phone: "+44 20 7946 0958" });

    expectToBeRight(result);
    expect(result.right).toBe("+442079460958");
  });

  it("should return error for invalid phone number", () => {
    const result = formatPhoneAsE164({ phone: "invalid" });

    expectToBeLeft(result);
    expect(result.left.issues).toHaveLength(1);
    expect(result.left.issues[0]!.message).toBe("Invalid phone number");
    expect(result.left.issues[0]!.code).toBe("INVALID_PHONE_NUMBER");
  });

  it("should return error for empty string", () => {
    const result = formatPhoneAsE164({ phone: "" });

    expectToBeLeft(result);
    expect(result.left.issues).toHaveLength(1);
    expect(result.left.issues[0]!.message).toBe("Invalid phone number");
    expect(result.left.issues[0]!.code).toBe("INVALID_PHONE_NUMBER");
  });

  it("should format very short phone number (however impractical)", () => {
    const result = formatPhoneAsE164({ phone: "12" });

    expectToBeRight(result);
    expect(result.right).toBe("+112");
  });

  it("should return error for too long phone number", () => {
    const result = formatPhoneAsE164({ phone: "123456789012345678901234567890" });

    expectToBeLeft(result);
    expect(result.left.issues).toHaveLength(1);
    expect(result.left.issues[0]!.message).toBe("Invalid phone number");
    expect(result.left.issues[0]!.code).toBe("INVALID_PHONE_NUMBER");
  });

  it("should format phone numbers with extensions by ignoring extension", () => {
    const result = formatPhoneAsE164({ phone: "(555) 123-4567 ext 123" });

    expectToBeRight(result);
    expect(result.right).toBe("+15551234567");
  });
});
