import { type ServerJsonApiQuery } from "../types";
import { parseQuery } from "./parseQuery";

const BASE_URL = "https://google.com";

describe("parseQuery", () => {
  it.each<{ expected: ServerJsonApiQuery; input: string; name: string }>([
    {
      name: "returns empty object if no matches",
      input: "hi=there",
      expected: {},
    },
    {
      name: "parses fields",
      input: "fields[user]=age",
      expected: { fields: { user: ["age"] } },
    },
    {
      name: "parses multiple fields",
      input: "fields[user]=age&fields[article]=title",
      expected: { fields: { user: ["age"], article: ["title"] } },
    },
    {
      name: "parses fields with multiple values",
      input: "fields[user]=age,dateOfBirth",
      expected: { fields: { user: ["age", "dateOfBirth"] } },
    },
    {
      name: "parses filter",
      input: "filter[age]=25",
      expected: { filter: { age: { eq: ["25"] } } },
    },
    {
      name: "parses multiple filters",
      input: "filter[age]=25&filter[dateOfBirth]=2024-01-01",
      expected: { filter: { age: { eq: ["25"] }, dateOfBirth: { eq: ["2024-01-01"] } } },
    },
    {
      name: "parses filters with multiple values",
      input: "filter[age]=25,30",
      expected: { filter: { age: { eq: ["25", "30"] } } },
    },
    {
      name: "parses multiple filter types",
      input: "filter[age][gt]=2&filter[age][gte]=3&filter[age][lt]=6&filter[age][lte]=5",
      expected: { filter: { age: { gt: ["2"], gte: ["3"], lt: ["6"], lte: ["5"] } } },
    },
    {
      name: "parses include",
      input: "include=articles",
      expected: { include: ["articles"] },
    },
    {
      name: "parses include with multiple values",
      input: "include=articles,articles.comments",
      expected: { include: ["articles", "articles.comments"] },
    },
    {
      name: "parses page",
      input: "page[size]=10&page[cursor]=a2c12",
      expected: { page: { cursor: "a2c12", size: "10" } },
    },
    {
      name: "parses limit/offset page",
      input: "page[limit]=10&page[number]=2&page[offset]=20",
      expected: { page: { limit: "10", number: "2", offset: "20" } },
    },
    {
      name: "parses sort",
      input: "sort=age",
      expected: { sort: ["age"] },
    },
    {
      name: "parses sort with multiple values",
      input: "sort=age,-dateOfBirth",
      expected: { sort: ["age", "-dateOfBirth"] },
    },
  ])("$name", ({ input, expected }) => {
    const url = new URL(`${BASE_URL}?${input}`);

    const actual = parseQuery(url.searchParams);

    expect(actual).toEqual(expected);
  });

  it("parses combinations", () => {
    const [date1, date2] = ["2024-01-01", "2024-01-02"];
    const input = `fields[user]=age,dateOfBirth&filter[age]=2&filter[dateOfBirth][gt]=${date1}&filter[dateOfBirth][lt]=${date2}&filter[isActive]=true&include=articles&page[size]=10&sort=-age`;
    const expected: ServerJsonApiQuery = {
      fields: { user: ["age", "dateOfBirth"] },
      filter: {
        age: { eq: ["2"] },
        dateOfBirth: { gt: [date1], lt: [date2] },
        isActive: { eq: ["true"] },
      },
      include: ["articles"],
      page: { size: "10" },
      sort: ["-age"],
    };

    const url = new URL(`${BASE_URL}?${input}`);
    const actual = parseQuery(url.searchParams);

    expect(actual).toEqual(expected);
  });
});
