import { toSearchParams } from "./toSearchParams";

describe("toSearchParams", () => {
  it("returns empty URLSearchParams for empty query", () => {
    const actual = toSearchParams({});

    expect(actual.toString()).toBe("");
    expect([...actual.values()]).toHaveLength(0);
  });

  it("converts fields", () => {
    const actual = toSearchParams({ fields: { dog: ["age"] } });

    expect(actual.get("fields[dog]")).toBe("age");
    expect([...actual.values()]).toHaveLength(1);
  });

  it("converts multiple fields", () => {
    const actual = toSearchParams({ fields: { dog: ["age", "name"] } });

    expect(actual.get("fields[dog]")).toBe("age,name");
    expect([...actual.values()]).toHaveLength(1);
  });

  it("converts fields with multiple values", () => {
    const actual = toSearchParams({ fields: { dog: ["age", "name"] } });

    expect(actual.get("fields[dog]")).toBe("age,name");
    expect([...actual.values()]).toHaveLength(1);
  });

  it("converts simple filter", () => {
    const actual = toSearchParams({ filter: { name: ["alice"] } });

    expect(actual.get("filter[name]")).toBe("alice");
    expect([...actual.values()]).toHaveLength(1);
  });

  it("converts multiple filters", () => {
    const actual = toSearchParams({ filter: { name: ["alice"], age: ["2"] } });

    expect(actual.get("filter[name]")).toBe("alice");
    expect(actual.get("filter[age]")).toBe("2");
    expect([...actual.values()]).toHaveLength(2);
  });

  it("converts number filter", () => {
    const actual = toSearchParams({ filter: { age: [2, 4] } });

    expect(actual.get("filter[age]")).toBe("2,4");
    expect([...actual.values()]).toHaveLength(1);
  });

  it("converts Date filter", () => {
    const isoDate = "2024-01-01T15:00:00.000Z";
    const actual = toSearchParams({
      filter: { createdAt: [new Date(isoDate)] },
    });

    expect(actual.get("filter[createdAt]")).toBe(isoDate);
    expect([...actual.values()]).toHaveLength(1);
  });

  it("converts filters with multiple values", () => {
    const actual = toSearchParams({ filter: { name: ["alice", "bob"] } });

    expect(actual.get("filter[name]")).toBe("alice,bob");
    expect([...actual.values()]).toHaveLength(1);
  });

  it("converts number filter type", () => {
    const actual = toSearchParams({ filter: { age: { gte: 2 } } });

    expect(actual.get("filter[age][gte]")).toBe("2");
    expect([...actual.values()]).toHaveLength(1);
  });

  it("converts boolean filter type", () => {
    const actual = toSearchParams({ filter: { isGoodDog: true } });

    expect(actual.get("filter[isGoodDog]")).toBe("true");
    expect([...actual.values()]).toHaveLength(1);
  });

  it("converts Date filter type", () => {
    const isoDate = "2024-01-01T15:00:00.000Z";
    const actual = toSearchParams({ filter: { createdAt: { gte: new Date(isoDate) } } });

    expect(actual.get("filter[createdAt][gte]")).toBe(isoDate);
    expect([...actual.values()]).toHaveLength(1);
  });

  it("converts multiple filter types", () => {
    const actual = toSearchParams({
      filter: { age: { gt: "2", gte: "3", lt: "6", lte: "5", not: "4" } },
    });

    expect(actual.get("filter[age][gt]")).toBe("2");
    expect(actual.get("filter[age][gte]")).toBe("3");
    expect(actual.get("filter[age][lt]")).toBe("6");
    expect(actual.get("filter[age][lte]")).toBe("5");
    expect(actual.get("filter[age][not]")).toBe("4");
    expect([...actual.values()]).toHaveLength(5);
  });

  it("converts include", () => {
    const actual = toSearchParams({ include: ["owner"] });

    expect(actual.get("include")).toBe("owner");
    expect([...actual.values()]).toHaveLength(1);
  });

  it("converts include with multiple values", () => {
    const actual = toSearchParams({ include: ["owner", "vet"] });

    expect(actual.get("include")).toBe("owner,vet");
    expect([...actual.values()]).toHaveLength(1);
  });

  it("converts page", () => {
    const actual = toSearchParams({ page: { size: "10", cursor: "a2c12" } });

    expect(actual.get("page[size]")).toBe("10");
    expect(actual.get("page[cursor]")).toBe("a2c12");
    expect([...actual.values()]).toHaveLength(2);
  });

  it("converts limit/offset page", () => {
    const actual = toSearchParams({ page: { limit: 10, number: 2, offset: 20 } });

    expect(actual.get("page[limit]")).toBe("10");
    expect(actual.get("page[number]")).toBe("2");
    expect(actual.get("page[offset]")).toBe("20");
    expect([...actual.values()]).toHaveLength(3);
  });

  it("converts sort", () => {
    const actual = toSearchParams({ sort: ["age"] });

    expect(actual.get("sort")).toBe("age");
    expect([...actual.values()]).toHaveLength(1);
  });

  it("converts sort with multiple values", () => {
    const actual = toSearchParams({ sort: ["age", "-name"] });

    expect(actual.get("sort")).toBe("age,-name");
    expect([...actual.values()]).toHaveLength(1);
  });

  it("converts combinations", () => {
    const isoDate = "2024-01-01T15:00:00.000Z";
    const actual = toSearchParams({
      fields: { dog: ["age"] },
      filter: { age: [2], createdAt: { gte: new Date(isoDate) } },
      include: ["owner"],
      page: { size: 10 },
      sort: ["-age"],
    });

    expect(actual.get("fields[dog]")).toBe("age");
    expect(actual.get("filter[age]")).toBe("2");
    expect(actual.get("filter[createdAt][gte]")).toBe(isoDate);
    expect(actual.get("include")).toBe("owner");
    expect(actual.get("page[size]")).toBe("10");
    expect(actual.get("sort")).toBe("-age");
    expect([...actual.values()]).toHaveLength(6);
  });
});
