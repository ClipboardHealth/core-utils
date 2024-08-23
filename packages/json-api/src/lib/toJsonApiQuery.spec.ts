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

  it("parses filter type ge", () => {
    expect(toJsonApiQuery(new URL(`${BASE_URL}?filter[age][ge]=2`).searchParams)).toEqual({
      filter: { age: { ge: "2" } },
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
    expect(
      toJsonApiQuery(
        new URL(`${BASE_URL}?filter[age]=2&include=vet&sort=age&fields[dog]=age&page[size]=10`)
          .searchParams,
      ),
    ).toEqual({
      fields: { dog: ["age"] },
      filter: { age: ["2"] },
      include: ["vet"],
      page: {
        size: "10",
      },
      sort: ["age"],
    });
  });
});
