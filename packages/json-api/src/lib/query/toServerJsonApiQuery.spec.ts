import { type ServerJsonApiQuery } from "../types";
import { toServerJsonApiQuery } from "./toServerJsonApiQuery";

const BASE_URL = "https://google.com";

describe("toJsonApiQuery", () => {
  it("returns empty object if no matches", () => {
    expect(toServerJsonApiQuery(new URL(`${BASE_URL}?hi=there`).searchParams)).toEqual({});
  });

  it("parses fields", () => {
    expect(toServerJsonApiQuery(new URL(`${BASE_URL}?fields[user]=age`).searchParams)).toEqual({
      fields: { user: ["age"] },
    });
  });

  it("parses multiple fields", () => {
    expect(
      toServerJsonApiQuery(
        new URL(`${BASE_URL}?fields[user]=age&fields[article]=title`).searchParams,
      ),
    ).toEqual({
      fields: { user: ["age"], article: ["title"] },
    });
  });

  it("parses fields with multiple values", () => {
    expect(
      toServerJsonApiQuery(new URL(`${BASE_URL}?fields[user]=age,dateOfBirth`).searchParams),
    ).toEqual({
      fields: { user: ["age", "dateOfBirth"] },
    });
  });

  it("parses filter", () => {
    expect(toServerJsonApiQuery(new URL(`${BASE_URL}?filter[age]=25`).searchParams)).toEqual({
      filter: { age: { eq: ["25"] } },
    });
  });

  it("parses multiple filters", () => {
    expect(
      toServerJsonApiQuery(
        new URL(`${BASE_URL}?filter[age]=25&filter[dateOfBirth]=2024-01-01`).searchParams,
      ),
    ).toEqual({
      filter: { age: { eq: ["25"] }, dateOfBirth: { eq: ["2024-01-01"] } },
    });
  });

  it("parses filters with multiple values", () => {
    expect(toServerJsonApiQuery(new URL(`${BASE_URL}?filter[age]=25,30`).searchParams)).toEqual({
      filter: { age: { eq: ["25", "30"] } },
    });
  });

  it("parses multiple filter types", () => {
    expect(
      toServerJsonApiQuery(
        new URL(
          `${BASE_URL}?filter[age][gt]=2&filter[age][gte]=3&filter[age][lt]=6&filter[age][lte]=5&filter[age][not]=4`,
        ).searchParams,
      ),
    ).toEqual({
      filter: { age: { gt: ["2"], gte: ["3"], lt: ["6"], lte: ["5"], not: ["4"] } },
    });
  });

  it("parses include", () => {
    expect(toServerJsonApiQuery(new URL(`${BASE_URL}?include=articles`).searchParams)).toEqual({
      include: ["articles"],
    });
  });

  it("parses include with multiple values", () => {
    expect(
      toServerJsonApiQuery(new URL(`${BASE_URL}?include=articles,articles.comments`).searchParams),
    ).toEqual({
      include: ["articles", "articles.comments"],
    });
  });

  it("parses page", () => {
    expect(
      toServerJsonApiQuery(new URL(`${BASE_URL}?page[size]=10&page[cursor]=a2c12`).searchParams),
    ).toEqual({
      page: {
        cursor: "a2c12",
        size: "10",
      },
    });
  });

  it("parses limit/offset page", () => {
    expect(
      toServerJsonApiQuery(
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
    expect(toServerJsonApiQuery(new URL(`${BASE_URL}?sort=age`).searchParams)).toEqual({
      sort: ["age"],
    });
  });

  it("parses sort with multiple values", () => {
    expect(toServerJsonApiQuery(new URL(`${BASE_URL}?sort=age,-dateOfBirth`).searchParams)).toEqual(
      {
        sort: ["age", "-dateOfBirth"],
      },
    );
  });

  it("parses combinations", () => {
    const [date1, date2] = ["2024-01-01", "2024-01-02"];
    const expected: ServerJsonApiQuery = {
      fields: { user: ["age", "dateOfBirth"] },
      filter: {
        age: { eq: ["2"] },
        dateOfBirth: { gt: [date1], lt: [date2] },
        isActive: { eq: ["true"] },
      },
      include: ["articles"],
      page: {
        size: "10",
      },
      sort: ["-age"],
    };

    expect(
      toServerJsonApiQuery(
        new URL(
          `${BASE_URL}?fields[user]=age,dateOfBirth&filter[age]=2&filter[dateOfBirth][gt]=${date1}&filter[dateOfBirth][lt]=${date2}&filter[isActive]=true&include=articles&page[size]=10&sort=-age`,
        ).searchParams,
      ),
    ).toEqual(expected);
  });
});
