import { validate } from "class-validator";

import { IsNanpPhoneNumber } from "./isNanpPhoneNumber.validator";

class TestDto {
  @IsNanpPhoneNumber()
  phone!: string;
}

function createDto(phone: unknown): TestDto {
  const dto = new TestDto();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  dto.phone = phone as any;
  return dto;
}

describe("IsNanpPhoneNumber", () => {
  it.each([
    { phone: "2125551234", name: "US phone number" },
    { phone: "+12125551234", name: "US phone number with +1 prefix" },
    { phone: "7872034310", name: "Puerto Rico phone number (787)" },
    { phone: "+17872034310", name: "Puerto Rico phone number with +1 prefix" },
    { phone: "6711234567", name: "Guam phone number (671)" },
    { phone: "3401234567", name: "US Virgin Islands phone number (340)" },
    { phone: "6841234567", name: "American Samoa phone number (684)" },
    { phone: "6701234567", name: "Northern Mariana Islands phone number (670)" },
  ])("should accept a valid $name", async ({ phone }) => {
    const dto = createDto(phone);

    const errors = await validate(dto);

    expect(errors).toHaveLength(0);
  });

  it.each([
    { phone: "123", name: "too short" },
    { phone: "notaphone", name: "non-numeric" },
    { phone: "", name: "empty string" },
  ])("should reject an invalid phone number ($name)", async ({ phone }) => {
    const dto = createDto(phone);

    const errors = await validate(dto);

    expect(errors).toHaveLength(1);
    expect(errors[0]?.constraints).toHaveProperty("IsNanpPhoneNumber");
  });

  it.each([
    { phone: "+442079460958", name: "UK phone number" },
    { phone: "+4930123456", name: "German phone number" },
  ])("should reject a non-NANP international number ($name)", async ({ phone }) => {
    const dto = createDto(phone);

    const errors = await validate(dto);

    expect(errors).toHaveLength(1);
    expect(errors[0]?.constraints).toHaveProperty("IsNanpPhoneNumber");
  });

  it("should reject non-string values", async () => {
    const dto = createDto(12_345);

    const errors = await validate(dto);

    expect(errors).toHaveLength(1);
  });
});
