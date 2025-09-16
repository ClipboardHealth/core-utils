import { createHash } from "node:crypto";

import { createDeterministicHash } from "./createDeterministicHash";

function createExpectedHash(ids: string[]): string {
  const sortedIds = ids.sort((a, b) => a.localeCompare(b)).join(",");
  return createHash("sha256").update(sortedIds).digest("hex").slice(0, 32);
}

describe("createDeterministicHash", () => {
  it("returns 32-character hash for recipients", () => {
    const input = [{ id: "user1" }, { id: "user2" }, { id: "user3" }];
    const expected = createExpectedHash(["user1", "user2", "user3"]);

    const actual = createDeterministicHash({ items: input });

    expect(actual).toBe(expected);
    expect(actual).toHaveLength(32);
  });

  it("sorts recipients by id before creating hash", () => {
    const input = [{ id: "charlie" }, { id: "alice" }, { id: "bob" }];
    const expected = createExpectedHash(["alice", "bob", "charlie"]);

    const actual = createDeterministicHash({ items: input });

    expect(actual).toBe(expected);
  });

  it("returns consistent hash for same recipients in different order", () => {
    const input1 = [{ id: "user1" }, { id: "user2" }, { id: "user3" }];
    const input2 = [{ id: "user3" }, { id: "user1" }, { id: "user2" }];

    const actual1 = createDeterministicHash({ items: input1 });
    const actual2 = createDeterministicHash({ items: input2 });

    expect(actual1).toBe(actual2);
  });

  it("handles empty array", () => {
    const input: Array<{ id: string }> = [];
    const expected = createExpectedHash([]);

    const actual = createDeterministicHash({ items: input });

    expect(actual).toBe(expected);
    expect(actual).toHaveLength(32);
  });

  it("handles duplicate ids consistently", () => {
    const input = [{ id: "user1" }, { id: "user1" }, { id: "user2" }];
    const expected = createExpectedHash(["user1", "user1", "user2"]);

    const actual = createDeterministicHash({ items: input });

    expect(actual).toBe(expected);
  });

  it("creates different hashes for different recipient sets", () => {
    const input1 = [{ id: "user1" }, { id: "user2" }];
    const input2 = [{ id: "user3" }, { id: "user4" }];

    const actual1 = createDeterministicHash({ items: input1 });
    const actual2 = createDeterministicHash({ items: input2 });

    expect(actual1).not.toBe(actual2);
    expect(actual1).toHaveLength(32);
    expect(actual2).toHaveLength(32);
  });

  it("handles array of strings", () => {
    const input = ["user1", "user2", "user3"];
    const expected = createExpectedHash(["user1", "user2", "user3"]);

    const actual = createDeterministicHash({ items: input });

    expect(actual).toBe(expected);
    expect(actual).toHaveLength(32);
  });

  it("handles custom separator", () => {
    const input = ["user1", "user2"];
    const separator = "|";
    const sortedIds = ["user1", "user2"].sort((a, b) => a.localeCompare(b)).join(separator);
    const expected = createHash("sha256").update(sortedIds).digest("hex").slice(0, 32);

    const actual = createDeterministicHash({ items: input, separator });

    expect(actual).toBe(expected);
  });

  it("handles custom character length", () => {
    const input = ["user1", "user2"];
    const characters = 16;

    const actual = createDeterministicHash({ items: input, characters });

    expect(actual).toHaveLength(characters);
  });
});
