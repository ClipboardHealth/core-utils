import { createHash } from "node:crypto";

import { stringify } from "@clipboard-health/util-ts";

import { createDeterministicHash } from "./createDeterministicHash";

function createExpectedResult(value: unknown): string {
  const normalized = typeof value === "string" ? value : stringify(value);
  return createHash("sha256").update(normalized).digest("hex");
}

describe("createDeterministicHash", () => {
  it("returns hash for array", () => {
    const input = ["user1", "user2", "user3"];
    const expected = createExpectedResult(input);

    const actual = createDeterministicHash(input);

    expect(actual).toBe(expected);
  });

  it("handles string without re-stringifying", () => {
    const input = "user1,user2,user3";
    const expected = createExpectedResult(input);

    const actual = createDeterministicHash(input);

    expect(actual).toBe(expected);
  });

  it("handles object by stringifying", () => {
    const input = { users: ["user1", "user2"] };
    const expected = createExpectedResult(input);

    const actual = createDeterministicHash(input);

    expect(actual).toBe(expected);
  });

  it("creates same hash when array stringifies to match string input", () => {
    const arrayInput = ["user1", "user2"];
    const stringInput = '["user1","user2"]';

    const actual1 = createDeterministicHash(arrayInput);
    const actual2 = createDeterministicHash(stringInput);

    expect(actual1).toBe(actual2);
  });

  it("handles empty array", () => {
    const input: string[] = [];
    const expected = createExpectedResult(input);

    const actual = createDeterministicHash(input);

    expect(actual).toBe(expected);
  });

  it("handles empty string", () => {
    const input = "";
    const expected = createExpectedResult(input);

    const actual = createDeterministicHash(input);

    expect(actual).toBe(expected);
  });

  it("creates different hashes for different values", () => {
    const input1 = ["user1", "user2"];
    const input2 = ["user3", "user4"];

    const actual1 = createDeterministicHash(input1);
    const actual2 = createDeterministicHash(input2);

    expect(actual1).not.toBe(actual2);
  });

  it("always returns 64-character hash", () => {
    const input1 = ["user1"];
    const input2 = ["user1", "user2", "user3", "user4", "user5"];
    const input3 = "a".repeat(1000);

    const actual1 = createDeterministicHash(input1);
    const actual2 = createDeterministicHash(input2);
    const actual3 = createDeterministicHash(input3);

    expect(actual1).toHaveLength(64);
    expect(actual2).toHaveLength(64);
    expect(actual3).toHaveLength(64);
  });
});
