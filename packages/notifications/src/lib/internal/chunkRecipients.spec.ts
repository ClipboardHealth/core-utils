import { MAXIMUM_RECIPIENTS_COUNT } from "../notificationClient";
import { chunkRecipients } from "./chunkRecipients";

describe("chunkRecipients", () => {
  it("returns single chunk with original idempotency key when recipients count equals maximum", () => {
    const input = {
      recipients: Array.from(
        { length: MAXIMUM_RECIPIENTS_COUNT },
        (_, index) => `user-${index + 1}`,
      ),
    };

    const actual = chunkRecipients(input);

    expect(actual).toHaveLength(1);
    expect(actual[0]).toEqual({
      number: 1,
      recipients: input.recipients,
    });
  });

  it("returns single chunk with empty recipients when no recipients provided", () => {
    const input = {
      recipients: [],
    };

    const actual = chunkRecipients(input);

    expect(actual).toHaveLength(1);
    expect(actual[0]).toEqual({
      number: 1,
      recipients: [],
    });
  });

  it("returns multiple chunks with indexed idempotency keys when recipients count exceeds maximum", () => {
    const input = {
      recipients: Array.from(
        { length: MAXIMUM_RECIPIENTS_COUNT + 1 },
        (_, index) => `user-${index + 1}`,
      ),
    };

    const actual = chunkRecipients(input);

    expect(actual).toHaveLength(2);
    expect(actual[0]).toEqual({
      number: 1,
      recipients: input.recipients.slice(0, MAXIMUM_RECIPIENTS_COUNT),
    });
    expect(actual[1]).toEqual({
      number: 2,
      recipients: input.recipients.slice(MAXIMUM_RECIPIENTS_COUNT, MAXIMUM_RECIPIENTS_COUNT + 1),
    });
  });
});
