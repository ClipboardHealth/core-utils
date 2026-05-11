import { ERROR_CODES } from "./errorCodes";
import { isClientError } from "./isClientError";

describe(isClientError, () => {
  it.each([
    [ERROR_CODES.clientError],
    [ERROR_CODES.invalidExpiresAt],
    [ERROR_CODES.invalidIdempotencyKey],
    [ERROR_CODES.missingSigningKey],
    [ERROR_CODES.recipientCountAboveMaximum],
    [ERROR_CODES.recipientCountBelowMinimum],
  ])("returns true for non-retryable client error code %s", (code) => {
    const actual = isClientError(code);

    expect(actual).toBe(true);
  });

  it.each([[ERROR_CODES.expired], [ERROR_CODES.rateLimited], [ERROR_CODES.unknown]])(
    "returns false for retryable or expiry code %s",
    (code) => {
      const actual = isClientError(code);

      expect(actual).toBe(false);
    },
  );

  it("returns false when code is undefined", () => {
    const undefinedCode: string | undefined = undefined;

    const actual = isClientError(undefinedCode);

    expect(actual).toBe(false);
  });

  it("returns false for unknown string codes", () => {
    const actual = isClientError("someUnrelatedCode");

    expect(actual).toBe(false);
  });
});
