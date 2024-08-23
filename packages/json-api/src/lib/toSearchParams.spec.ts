import { toSearchParams } from "./toSearchParams";

describe("toSearchParams", () => {
  it("returns empty URLSearchParams for empty query", () => {
    const actual = toSearchParams({});

    expect(actual.toString()).toBe("");
  });

  it("converts fields", () => {
    const actual = toSearchParams({ fields: { dog: ["age"] } });

    expect(actual.get("fields[dog]")).toBe("age");
    expect(actual.toString()).toBe("fields%5Bdog%5D=age");
  });

  it("converts fields with multiple values", () => {
    const actual = toSearchParams({ fields: { dog: ["age", "name"] } });

    expect(actual.get("fields[dog]")).toBe("age,name");
    expect(actual.toString()).toBe("fields%5Bdog%5D=age%2Cname");
  });

  it("converts simple filter", () => {
    const actual = toSearchParams({ filter: { name: ["alice"] } });

    expect(actual.get("filter[name]")).toBe("alice");
    expect(actual.toString()).toBe("filter%5Bname%5D=alice");
  });

  it("converts multiple filters", () => {
    const actual = toSearchParams({ filter: { name: ["alice"], age: ["2"] } });

    expect(actual.get("filter[name]")).toBe("alice");
    expect(actual.get("filter[age]")).toBe("2");
    expect(actual.toString()).toBe("filter%5Bname%5D=alice&filter%5Bage%5D=2");
  });

  it("converts filters with multiple values", () => {
    const actual = toSearchParams({ filter: { name: ["alice", "bob"] } });

    expect(actual.get("filter[name]")).toBe("alice,bob");
    expect(actual.toString()).toBe("filter%5Bname%5D=alice%2Cbob");
  });

  it("converts complex filter", () => {
    const actual = toSearchParams({ filter: { age: { gte: "2" } } });

    expect(actual.get("filter[age][gte]")).toBe("2");
    expect(actual.toString()).toBe("filter%5Bage%5D%5Bgte%5D=2");
  });

  it("converts include", () => {
    const actual = toSearchParams({ include: ["owner"] });

    expect(actual.get("include")).toBe("owner");
    expect(actual.toString()).toBe("include=owner");
  });

  it("converts include with multiple values", () => {
    const actual = toSearchParams({ include: ["owner", "vet"] });

    expect(actual.get("include")).toBe("owner,vet");
    expect(actual.toString()).toBe("include=owner%2Cvet");
  });

  it("converts page", () => {
    const actual = toSearchParams({ page: { size: "10", cursor: "a2c12" } });

    expect(actual.get("page[size]")).toBe("10");
    expect(actual.get("page[cursor]")).toBe("a2c12");
    expect(actual.toString()).toBe("page%5Bsize%5D=10&page%5Bcursor%5D=a2c12");
  });

  it("converts sort", () => {
    const actual = toSearchParams({ sort: ["age"] });

    expect(actual.get("sort")).toBe("age");
    expect(actual.toString()).toBe("sort=age");
  });

  it("converts sort with multiple values", () => {
    const actual = toSearchParams({ sort: ["age", "-name"] });

    expect(actual.get("sort")).toBe("age,-name");
    expect(actual.toString()).toBe("sort=age%2C-name");
  });

  it("converts combinations", () => {
    const actual = toSearchParams({
      fields: { dog: ["age"] },
      filter: { age: ["2"] },
      include: ["vet"],
      page: { size: "10" },
      sort: ["age"],
    });

    expect(actual.get("fields[dog]")).toBe("age");
    expect(actual.get("filter[age]")).toBe("2");
    expect(actual.get("include")).toBe("vet");
    expect(actual.get("page[size]")).toBe("10");
    expect(actual.get("sort")).toBe("age");
    expect(actual.toString()).toBe(
      "fields%5Bdog%5D=age&filter%5Bage%5D=2&include=vet&page%5Bsize%5D=10&sort=age",
    );
  });
});
