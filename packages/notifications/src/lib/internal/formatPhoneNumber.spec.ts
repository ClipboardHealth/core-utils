import { formatPhoneNumber } from "./formatPhoneNumber";

describe("formatPhoneNumber", () => {
  it("formats valid phone number to E.164 format", () => {
    const result = formatPhoneNumber({ phoneNumber: "+1234567890" });
    expect(result).toBe("+1234567890");
  });

  it("returns original phone number when formatting fails", () => {
    const invalidPhoneNumber = "invalid-phone";
    const result = formatPhoneNumber({ phoneNumber: invalidPhoneNumber });
    expect(result).toBe(invalidPhoneNumber);
  });
});
