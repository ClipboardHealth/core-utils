import { createHash } from "node:crypto";

import { createDeterministicHash } from "./createDeterministicHash";

function createExpectedHash(ids: string[]): string {
  return createHash("sha256").update(JSON.stringify(ids.sort())).digest("hex");
}

describe("createDeterministicHash", () => {
  it("returns 32-character hash for recipients", () => {
    const input = ["user1", "user2", "user3"];
    const expected = createExpectedHash(["user1", "user2", "user3"]);

    const actual = createDeterministicHash({ values: input });

    expect(actual).toBe(expected);
    expect(actual).toHaveLength(64);
  });

  it("sorts recipients by id before creating hash", () => {
    const input = ["charlie", "alice", "bob"];
    const expected = createExpectedHash(["alice", "bob", "charlie"]);

    const actual = createDeterministicHash({ values: input });

    expect(actual).toBe(expected);
  });

  it("returns consistent hash for same recipients in different order", () => {
    const input1 = ["user1", "user2", "user3"];
    const input2 = ["user3", "user1", "user2"];

    const actual1 = createDeterministicHash({ values: input1 });
    const actual2 = createDeterministicHash({ values: input2 });

    expect(actual1).toBe(actual2);
  });

  it("handles empty array", () => {
    const input: string[] = [];
    const expected = createExpectedHash([]);

    const actual = createDeterministicHash({ values: input });

    expect(actual).toBe(expected);
    expect(actual).toHaveLength(64);
  });

  it("handles duplicate ids consistently", () => {
    const input = ["user1", "user1", "user2"];
    const expected = createExpectedHash(["user1", "user1", "user2"]);

    const actual = createDeterministicHash({ values: input });

    expect(actual).toBe(expected);
  });

  it("creates different hashes for different recipient sets", () => {
    const input1 = ["user1", "user2"];
    const input2 = ["user3", "user4"];

    const actual1 = createDeterministicHash({ values: input1 });
    const actual2 = createDeterministicHash({ values: input2 });

    expect(actual1).not.toBe(actual2);
    expect(actual1).toHaveLength(64);
    expect(actual2).toHaveLength(64);
  });
});
