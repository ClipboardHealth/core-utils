import { chunkRecipients } from "./chunkRecipients";
import { MAXIMUM_RECIPIENTS_COUNT } from "./notificationClient";

describe("chunkRecipients", () => {
  const mockIdempotencyKey = "test-notification-12345";

  it("returns single chunk with original idempotency key when recipients count equals maximum", () => {
    const input = {
      idempotencyKey: mockIdempotencyKey,
      recipientIds: Array.from(
        { length: MAXIMUM_RECIPIENTS_COUNT },
        (_, index) => `user-${index + 1}`,
      ),
    };

    const actual = chunkRecipients(input);

    expect(actual).toHaveLength(1);
    expect(actual[0]).toEqual({
      idempotencyKey: mockIdempotencyKey,
      recipientIds: input.recipientIds,
    });
  });

  it("returns empty array when no recipients provided", () => {
    const input = {
      idempotencyKey: mockIdempotencyKey,
      recipientIds: [],
    };

    const actual = chunkRecipients(input);

    expect(actual).toHaveLength(1);
    expect(actual[0]).toEqual({
      idempotencyKey: mockIdempotencyKey,
      recipientIds: [],
    });
  });

  it("returns multiple chunks with indexed idempotency keys when recipients count exceeds maximum", () => {
    const input = {
      idempotencyKey: mockIdempotencyKey,
      recipientIds: Array.from(
        { length: MAXIMUM_RECIPIENTS_COUNT + 1 },
        (_, index) => `user-${index + 1}`,
      ),
    };

    const actual = chunkRecipients(input);

    expect(actual).toHaveLength(2);
    expect(actual[0]).toEqual({
      idempotencyKey: `${mockIdempotencyKey}-chunk-1`,
      recipientIds: input.recipientIds.slice(0, MAXIMUM_RECIPIENTS_COUNT),
    });
    expect(actual[1]).toEqual({
      idempotencyKey: `${mockIdempotencyKey}-chunk-2`,
      recipientIds: input.recipientIds.slice(
        MAXIMUM_RECIPIENTS_COUNT,
        MAXIMUM_RECIPIENTS_COUNT + 1,
      ),
    });
  });
});
