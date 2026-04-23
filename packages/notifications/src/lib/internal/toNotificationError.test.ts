import { ERROR_CODES } from "../errorCodes";
import { toNotificationError } from "./toNotificationError";

function createErrorWithStatus(message: string, status: unknown): Error {
  const error = new Error(message) as Error & { status: unknown };
  error.status = status;
  return error;
}

describe(toNotificationError, () => {
  it("maps 429 responses to rateLimited", () => {
    const input = createErrorWithStatus("slow down", 429);

    const actual = toNotificationError(input);

    expect(actual.code).toBe(ERROR_CODES.rateLimited);
    expect(actual.message).toBe("slow down");
    expect(actual.error).toBe(input);
  });

  it.each([400, 401, 403, 404, 409, 422, 499])(
    "maps status %s to clientError",
    (status: number) => {
      const input = createErrorWithStatus(`failed with ${status}`, status);

      const actual = toNotificationError(input);

      expect(actual.code).toBe(ERROR_CODES.clientError);
      expect(actual.message).toBe(`failed with ${status}`);
    },
  );

  it.each([500, 502, 503])("maps 5xx status %s to unknown", (status: number) => {
    const input = createErrorWithStatus(`failed with ${status}`, status);

    const actual = toNotificationError(input);

    expect(actual.code).toBe(ERROR_CODES.unknown);
  });

  it("maps errors without a status to unknown", () => {
    const input = new Error("boom");

    const actual = toNotificationError(input);

    expect(actual.code).toBe(ERROR_CODES.unknown);
    expect(actual.message).toBe("boom");
  });

  it("maps non-Error throwables to unknown", () => {
    const actual = toNotificationError("something went wrong");

    expect(actual.code).toBe(ERROR_CODES.unknown);
    expect(actual.error).toBeInstanceOf(Error);
  });

  it("ignores non-numeric status values", () => {
    const input = createErrorWithStatus("weird", "429");

    const actual = toNotificationError(input);

    expect(actual.code).toBe(ERROR_CODES.unknown);
  });
});
