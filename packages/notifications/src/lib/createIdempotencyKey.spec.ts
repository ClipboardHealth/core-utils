import { createHash } from "node:crypto";

import { createIdempotencyKey } from "./createIdempotencyKey";

function createExpectedResult(key: string, value: unknown): string {
  const normalized = typeof value === "string" ? value : JSON.stringify(value);
  const hash = createHash("sha256").update(normalized).digest("hex");
  return `${key}:${hash}`;
}

const MAX_IDEMPOTENCY_KEY_LENGTH = 255;

describe("createIdempotencyKey", () => {
  it("returns hash with key for array", () => {
    const input = ["user1", "user2", "user3"];
    const key = "test-";
    const expected = createExpectedResult(key, input);

    const actual = createIdempotencyKey({ key, value: input });

    expect(actual).toBe(expected);
  });

  it("handles string without re-stringifying", () => {
    const input = "user1,user2,user3";
    const key = "str-";
    const expected = createExpectedResult(key, input);

    const actual = createIdempotencyKey({ key, value: input });

    expect(actual).toBe(expected);
  });

  it("handles object by stringifying", () => {
    const input = { users: ["user1", "user2"] };
    const key = "obj-";
    const expected = createExpectedResult(key, input);

    const actual = createIdempotencyKey({ key, value: input });

    expect(actual).toBe(expected);
  });

  it("creates same hash when array stringifies to match string input", () => {
    const arrayInput = ["user1", "user2"];
    const stringInput = '["user1","user2"]';
    const key = "diff-";

    const actual1 = createIdempotencyKey({ key, value: arrayInput });
    const actual2 = createIdempotencyKey({ key, value: stringInput });

    expect(actual1).toBe(actual2);
  });

  it("handles empty array", () => {
    const input: string[] = [];
    const key = "empty-";
    const expected = createExpectedResult(key, input);

    const actual = createIdempotencyKey({ key, value: input });

    expect(actual).toBe(expected);
  });

  it("handles empty string", () => {
    const input = "";
    const key = "empty-str-";
    const expected = createExpectedResult(key, input);

    const actual = createIdempotencyKey({ key, value: input });

    expect(actual).toBe(expected);
  });

  it("creates different hashes for different values", () => {
    const input1 = ["user1", "user2"];
    const input2 = ["user3", "user4"];
    const key = "diff-";

    const actual1 = createIdempotencyKey({ key, value: input1 });
    const actual2 = createIdempotencyKey({ key, value: input2 });

    expect(actual1).not.toBe(actual2);
  });

  it("handles empty key", () => {
    const input = ["user1", "user2"];
    const key = "";
    const expected = createExpectedResult(key, input);

    const actual = createIdempotencyKey({ key, value: input });

    expect(actual).toBe(expected);
  });

  it("creates different results with different keys", () => {
    const input = ["user1", "user2"];
    const key1 = "key1-";
    const key2 = "key2-";

    const actual1 = createIdempotencyKey({ key: key1, value: input });
    const actual2 = createIdempotencyKey({ key: key2, value: input });

    expect(actual1).not.toBe(actual2);
    expect(actual1.startsWith(`${key1}:`)).toBe(true);
    expect(actual2.startsWith(`${key2}:`)).toBe(true);
  });

  describe("truncation to MAX_IDEMPOTENCY_KEY_LENGTH characters", () => {
    it("returns full result when under MAX_IDEMPOTENCY_KEY_LENGTH characters", () => {
      const input = ["user1"];
      const key = "short";
      const expected = createExpectedResult(key, input);

      const actual = createIdempotencyKey({ key, value: input });

      expect(actual).toBe(expected);
      expect(actual.length).toBeLessThan(MAX_IDEMPOTENCY_KEY_LENGTH);
    });

    it("truncates result to exactly MAX_IDEMPOTENCY_KEY_LENGTH characters when longer", () => {
      const input = ["user1"];
      const longKey = "a".repeat(200);

      const actual = createIdempotencyKey({ key: longKey, value: input });

      expect(actual).toHaveLength(MAX_IDEMPOTENCY_KEY_LENGTH);
      expect(actual.startsWith(`${longKey}:`)).toBe(true);
    });

    it("handles case where key alone exceeds MAX_IDEMPOTENCY_KEY_LENGTH characters", () => {
      const input = ["user1"];
      const veryLongKey = "a".repeat(300);
      const expected = createExpectedResult(veryLongKey, input).slice(
        0,
        MAX_IDEMPOTENCY_KEY_LENGTH,
      );

      const actual = createIdempotencyKey({ key: veryLongKey, value: input });

      expect(actual).toHaveLength(MAX_IDEMPOTENCY_KEY_LENGTH);
      expect(actual).toBe(expected);
    });

    it("truncates at exactly MAX_IDEMPOTENCY_KEY_LENGTH characters", () => {
      const input = ["user1"];
      const key = "a".repeat(190); // 190 + 1 (colon) + 64 (hash) = 255

      const actual = createIdempotencyKey({ key, value: input });

      expect(actual).toHaveLength(MAX_IDEMPOTENCY_KEY_LENGTH);
      expect(actual.startsWith(`${key}:`)).toBe(true);
    });
  });
});
