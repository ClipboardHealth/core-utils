import { createHash } from "node:crypto";

import { createIdempotencyKey } from "./createIdempotencyKey";

function createExpectedHash(ids: string[]): string {
  return createHash("sha256").update(JSON.stringify(ids.sort())).digest("hex");
}

describe("createIdempotencyKey", () => {
  it("returns hash with key for recipients", () => {
    const input = ["user1", "user2", "user3"];
    const key = "test-";
    const expectedHash = createExpectedHash(["user1", "user2", "user3"]);
    const expected = `${key}${expectedHash}`;

    const actual = createIdempotencyKey({ key, valuesToHash: input });

    expect(actual).toBe(expected);
  });

  it("sorts recipients by id before creating hash", () => {
    const input = ["charlie", "alice", "bob"];
    const key = "sort-";
    const expectedHash = createExpectedHash(["alice", "bob", "charlie"]);
    const expected = `${key}${expectedHash}`;

    const actual = createIdempotencyKey({ key, valuesToHash: input });

    expect(actual).toBe(expected);
  });

  it("returns consistent hash for same recipients in different order", () => {
    const input1 = ["user1", "user2", "user3"];
    const input2 = ["user3", "user1", "user2"];
    const key = "consistent-";

    const actual1 = createIdempotencyKey({ key, valuesToHash: input1 });
    const actual2 = createIdempotencyKey({ key, valuesToHash: input2 });

    expect(actual1).toBe(actual2);
  });

  it("handles empty array", () => {
    const input: string[] = [];
    const key = "empty-";
    const expectedHash = createExpectedHash([]);
    const expected = `${key}${expectedHash}`;

    const actual = createIdempotencyKey({ key, valuesToHash: input });

    expect(actual).toBe(expected);
  });

  it("handles duplicate ids consistently", () => {
    const input = ["user1", "user1", "user2"];
    const key = "dup-";
    const expectedHash = createExpectedHash(["user1", "user1", "user2"]);
    const expected = `${key}${expectedHash}`;

    const actual = createIdempotencyKey({ key, valuesToHash: input });

    expect(actual).toBe(expected);
  });

  it("creates different hashes for different recipient sets", () => {
    const input1 = ["user1", "user2"];
    const input2 = ["user3", "user4"];
    const key = "diff-";

    const actual1 = createIdempotencyKey({ key, valuesToHash: input1 });
    const actual2 = createIdempotencyKey({ key, valuesToHash: input2 });

    expect(actual1).not.toBe(actual2);
  });

  it("handles empty key", () => {
    const input = ["user1", "user2"];
    const key = "";
    const expectedHash = createExpectedHash(["user1", "user2"]);

    const actual = createIdempotencyKey({ key, valuesToHash: input });

    expect(actual).toBe(expectedHash);
  });

  it("creates different results with different keys", () => {
    const input = ["user1", "user2"];
    const key1 = "key1-";
    const key2 = "key2-";

    const actual1 = createIdempotencyKey({ key: key1, valuesToHash: input });
    const actual2 = createIdempotencyKey({ key: key2, valuesToHash: input });

    expect(actual1).not.toBe(actual2);
    expect(actual1.startsWith(key1)).toBe(true);
    expect(actual2.startsWith(key2)).toBe(true);
  });

  describe("truncation to 255 characters", () => {
    it("returns full result when under 255 characters", () => {
      const input = ["user1"];
      const key = "short";
      const expectedHash = createExpectedHash(["user1"]);
      const expectedResult = `${key}${expectedHash}`;

      const actual = createIdempotencyKey({ key, valuesToHash: input });

      expect(actual).toBe(expectedResult);
      expect(actual.length).toBeLessThan(255);
    });

    it("truncates result to exactly 255 characters when longer", () => {
      const input = ["user1"];
      const longKey = "a".repeat(200);

      const actual = createIdempotencyKey({ key: longKey, valuesToHash: input });

      expect(actual).toHaveLength(255);
      expect(actual.startsWith(longKey.slice(0, 255 - 64))).toBe(true);
    });

    it("handles case where key alone exceeds 255 characters", () => {
      const input = ["user1"];
      const veryLongKey = "a".repeat(300);

      const actual = createIdempotencyKey({ key: veryLongKey, valuesToHash: input });

      expect(actual).toHaveLength(255);
      expect(actual).toBe(veryLongKey.slice(0, 255));
    });

    it("truncates at exactly 255 characters", () => {
      const input = ["user1"];
      const key = "a".repeat(191); // 191 + 64 = 255 exactly

      const actual = createIdempotencyKey({ key, valuesToHash: input });

      expect(actual).toHaveLength(255);
      expect(actual.startsWith(key)).toBe(true);
    });
  });
});
