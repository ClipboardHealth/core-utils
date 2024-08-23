import { toJsonApiQuery } from "./toJsonApiQuery";

const BASE_URL = "https://google.com";

describe("toJsonApiQuery", () => {
  it("returns empty object if no matches", () => {
    expect(toJsonApiQuery(new URL(`${BASE_URL}?hi=there`).searchParams)).toEqual({});
  });

  it("parses fields", () => {
    expect(toJsonApiQuery(new URL(`${BASE_URL}?fields[dog]=age`).searchParams)).toEqual({
      fields: { dog: ["age"] },
    });
  });

  it("parses multiple fields", () => {
    expect(
      toJsonApiQuery(new URL(`${BASE_URL}?fields[dog]=age&fields[vet]=name`).searchParams),
    ).toEqual({
      fields: { dog: ["age"], vet: ["name"] },
    });
  });

  it("parses fields with multiple values", () => {
    expect(toJsonApiQuery(new URL(`${BASE_URL}?fields[dog]=age,name`).searchParams)).toEqual({
      fields: { dog: ["age", "name"] },
    });
  });

  it("parses filter", () => {
    expect(toJsonApiQuery(new URL(`${BASE_URL}?filter[name]=alice`).searchParams)).toEqual({
      filter: { name: ["alice"] },
    });
  });

  it("parses multiple filters", () => {
    expect(
      toJsonApiQuery(new URL(`${BASE_URL}?filter[name]=alice&filter[age]=2`).searchParams),
    ).toEqual({
      filter: { age: ["2"], name: ["alice"] },
    });
  });

  it("parses filters with multiple values", () => {
    expect(toJsonApiQuery(new URL(`${BASE_URL}?filter[name]=alice,bob`).searchParams)).toEqual({
      filter: { name: ["alice", "bob"] },
    });
  });

  it("parses multiple filter types", () => {
    expect(
      toJsonApiQuery(
        new URL(
          `${BASE_URL}?filter[age][gt]=2&filter[age][gte]=3&filter[age][lt]=6&filter[age][lte]=5&filter[age][not]=4`,
        ).searchParams,
      ),
    ).toEqual({
      filter: { age: { gt: "2", gte: "3", lt: "6", lte: "5", not: "4" } },
    });
  });

  it("parses include", () => {
    expect(toJsonApiQuery(new URL(`${BASE_URL}?include=owner`).searchParams)).toEqual({
      include: ["owner"],
    });
  });

  it("parses include with multiple values", () => {
    expect(toJsonApiQuery(new URL(`${BASE_URL}?include=owner,vet`).searchParams)).toEqual({
      include: ["owner", "vet"],
    });
  });

  it("parses page", () => {
    expect(
      toJsonApiQuery(new URL(`${BASE_URL}?page[size]=10&page[cursor]=a2c12`).searchParams),
    ).toEqual({
      page: {
        cursor: "a2c12",
        size: "10",
      },
    });
  });

  it("parses limit/offset page", () => {
    expect(
      toJsonApiQuery(
        new URL(`${BASE_URL}?page[limit]=10&page[number]=2&page[offset]=20`).searchParams,
      ),
    ).toEqual({
      page: {
        limit: "10",
        number: "2",
        offset: "20",
      },
    });
  });

  it("parses sort", () => {
    expect(toJsonApiQuery(new URL(`${BASE_URL}?sort=age`).searchParams)).toEqual({
      sort: ["age"],
    });
  });

  it("parses sort with multiple values", () => {
    expect(toJsonApiQuery(new URL(`${BASE_URL}?sort=age,-name`).searchParams)).toEqual({
      sort: ["age", "-name"],
    });
  });

  it("parses combinations", () => {
    const isoDate = "2024-01-01T15:00:00.000Z";
    expect(
      toJsonApiQuery(
        new URL(
          `${BASE_URL}?fields[dog]=age&filter[age]=2&filter[createdAt][gte]=${isoDate}&include=owner&page[size]=10&sort=-age`,
        ).searchParams,
      ),
    ).toEqual({
      fields: { dog: ["age"] },
      filter: { age: ["2"], createdAt: { gte: isoDate } },
      include: ["owner"],
      page: {
        size: "10",
      },
      sort: ["-age"],
    });
  });
});
