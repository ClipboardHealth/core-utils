import { toClientSearchParams } from "./toClientSearchParams";

describe("toClientSearchParams", () => {
  it("returns empty URLSearchParams for empty query", () => {
    const actual = toClientSearchParams({});

    expect(actual.toString()).toBe("");
    expect([...actual.values()]).toHaveLength(0);
  });

  it("converts fields", () => {
    const actual = toClientSearchParams({ fields: { dog: ["age"] } });

    expect(actual.get("fields[dog]")).toBe("age");
    expect([...actual.values()]).toHaveLength(1);
  });

  it("converts multiple fields", () => {
    const actual = toClientSearchParams({ fields: { dog: ["age", "name"] } });

    expect(actual.get("fields[dog]")).toBe("age,name");
    expect([...actual.values()]).toHaveLength(1);
  });

  it("converts fields with multiple values", () => {
    const actual = toClientSearchParams({ fields: { dog: ["age", "name"] } });

    expect(actual.get("fields[dog]")).toBe("age,name");
    expect([...actual.values()]).toHaveLength(1);
  });

  it("converts filter", () => {
    const actual = toClientSearchParams({ filter: { name: { eq: ["snoopy"] } } });

    expect(actual.get("filter[name]")).toBe("snoopy");
    expect([...actual.values()]).toHaveLength(1);
  });

  it("converts multiple filters", () => {
    const actual = toClientSearchParams({
      filter: { name: { eq: ["snoopy"] }, age: { eq: ["2"] } },
    });

    expect(actual.get("filter[name]")).toBe("snoopy");
    expect(actual.get("filter[age]")).toBe("2");
    expect([...actual.values()]).toHaveLength(2);
  });

  it("converts boolean filter", () => {
    const actual = toClientSearchParams({ filter: { isGoodDog: { eq: ["true"] } } });

    expect(actual.get("filter[isGoodDog]")).toBe("true");
    expect([...actual.values()]).toHaveLength(1);
  });

  it("converts Date filter", () => {
    const isoDate = "2024-01-01T15:00:00.000Z";
    const actual = toClientSearchParams({ filter: { createdAt: { eq: [new Date(isoDate)] } } });

    expect(actual.get("filter[createdAt]")).toBe(isoDate);
    expect([...actual.values()]).toHaveLength(1);
  });

  it("converts number filter", () => {
    const actual = toClientSearchParams({ filter: { age: { eq: [2, 4] } } });

    expect(actual.get("filter[age]")).toBe("2,4");
    expect([...actual.values()]).toHaveLength(1);
  });

  it("converts filters with multiple values", () => {
    const actual = toClientSearchParams({ filter: { name: { eq: ["snoopy", "lassie"] } } });

    expect(actual.get("filter[name]")).toBe("snoopy,lassie");
    expect([...actual.values()]).toHaveLength(1);
  });

  it("converts Date filter type", () => {
    const isoDate = "2024-01-01T15:00:00.000Z";
    const actual = toClientSearchParams({ filter: { createdAt: { gte: [new Date(isoDate)] } } });

    expect(actual.get("filter[createdAt][gte]")).toBe(isoDate);
    expect([...actual.values()]).toHaveLength(1);
  });

  it("converts number filter type", () => {
    const actual = toClientSearchParams({ filter: { age: { gte: [2] } } });

    expect(actual.get("filter[age][gte]")).toBe("2");
    expect([...actual.values()]).toHaveLength(1);
  });

  it("converts multiple filter types", () => {
    const actual = toClientSearchParams({
      filter: {
        age: { eq: ["1"], ne: ["2"], gt: ["3"], gte: ["4"], lt: ["5"], lte: ["6"] },
      },
    });

    expect(actual.get("filter[age]")).toBe("1");
    expect(actual.get("filter[age][ne]")).toBe("2");
    expect(actual.get("filter[age][gt]")).toBe("3");
    expect(actual.get("filter[age][gte]")).toBe("4");
    expect(actual.get("filter[age][lt]")).toBe("5");
    expect(actual.get("filter[age][lte]")).toBe("6");
    expect([...actual.values()]).toHaveLength(6);
  });

  it("converts include", () => {
    const actual = toClientSearchParams({ include: ["owner"] });

    expect(actual.get("include")).toBe("owner");
    expect([...actual.values()]).toHaveLength(1);
  });

  it("converts include with multiple values", () => {
    const actual = toClientSearchParams({ include: ["owner", "vet"] });

    expect(actual.get("include")).toBe("owner,vet");
    expect([...actual.values()]).toHaveLength(1);
  });

  it("converts page", () => {
    const actual = toClientSearchParams({ page: { size: "10", cursor: "a2c12" } });

    expect(actual.get("page[size]")).toBe("10");
    expect(actual.get("page[cursor]")).toBe("a2c12");
    expect([...actual.values()]).toHaveLength(2);
  });

  it("converts limit/offset page", () => {
    const actual = toClientSearchParams({ page: { limit: 10, number: 2, offset: 20 } });

    expect(actual.get("page[limit]")).toBe("10");
    expect(actual.get("page[number]")).toBe("2");
    expect(actual.get("page[offset]")).toBe("20");
    expect([...actual.values()]).toHaveLength(3);
  });

  it("converts sort", () => {
    const actual = toClientSearchParams({ sort: ["age"] });

    expect(actual.get("sort")).toBe("age");
    expect([...actual.values()]).toHaveLength(1);
  });

  it("converts sort with multiple values", () => {
    const actual = toClientSearchParams({ sort: ["age", "-name"] });

    expect(actual.get("sort")).toBe("age,-name");
    expect([...actual.values()]).toHaveLength(1);
  });

  it("converts combinations", () => {
    const [date1, date2] = [new Date("2024-01-01"), new Date("2024-01-02")];
    const actual = toClientSearchParams({
      fields: { dog: ["name", "age"] },
      filter: {
        age: { eq: ["2"] },
        createdAt: { gt: [date1], lt: [date2] },
        isGoodDog: { eq: ["true"] },
      },
      include: ["owner"],
      page: {
        size: "10",
      },
      sort: ["-age"],
    });

    expect(actual.get("fields[dog]")).toBe("name,age");
    expect(actual.get("filter[age]")).toBe("2");
    expect(actual.get("filter[createdAt][gt]")).toBe(date1.toISOString());
    expect(actual.get("filter[createdAt][lt]")).toBe(date2.toISOString());
    expect(actual.get("filter[isGoodDog]")).toBe("true");
    expect(actual.get("include")).toBe("owner");
    expect(actual.get("page[size]")).toBe("10");
    expect(actual.get("sort")).toBe("-age");
    expect([...actual.values()]).toHaveLength(8);
  });
});
