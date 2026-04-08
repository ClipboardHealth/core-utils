import { type ClientJsonApiQuery } from "../types";
import { stringifyQuery } from "./stringifyQuery";

function stringify(query: ClientJsonApiQuery): string {
  return stringifyQuery(query, { encode: false });
}

describe("stringifyQuery", () => {
  it("encodes", () => {
    const actual = stringifyQuery({ fields: { user: "age" } });

    // cspell:disable-next-line
    expect(actual).toBe("fields%5Buser%5D=age");
  });

  it("returns empty URLSearchParams for empty query", () => {
    const actual = stringify({});

    expect(actual).toBe("");
  });

  it("converts fields", () => {
    const actual = stringify({ fields: { user: "age" } });

    expect(actual).toBe("fields[user]=age");
  });

  it("converts dot fields", () => {
    const actual = stringify({ fields: { "user.account": "createdAt" } });

    expect(actual).toBe("fields[user.account]=createdAt");
  });

  it("converts multiple fields", () => {
    const actual = stringify({ fields: { user: ["age", "dateOfBirth"] } });

    expect(actual).toBe("fields[user]=age,dateOfBirth");
  });

  it("converts filter", () => {
    const actual = stringify({ filter: { age: 25 } });

    expect(actual).toBe("filter[age]=25");
  });

  it("converts multiple filters", () => {
    const date1 = new Date("2024-01-01");
    const actual = stringify({
      filter: { age: 25, dateOfBirth: { gt: [date1] } },
    });

    expect(actual).toBe("filter[age]=25&filter[dateOfBirth][gt]=2024-01-01T00:00:00.000Z");
  });

  it("converts nested filters", () => {
    const actual = stringify({
      filter: { location: { latitude: 40, longitude: -104 } },
    });

    expect(actual).toBe("filter[location][latitude]=40&filter[location][longitude]=-104");
  });

  it("converts boolean filter", () => {
    const actual = stringify({ filter: { isActive: true } });

    expect(actual).toBe("filter[isActive]=true");
  });

  it("converts Date filter", () => {
    const isoDate = "2024-01-01T15:00:00.000Z";
    const actual = stringify({ filter: { dateOfBirth: new Date(isoDate) } });

    expect(actual).toBe(`filter[dateOfBirth]=${isoDate}`);
  });

  it("converts number filter", () => {
    const actual = stringify({ filter: { age: [2, 4] } });

    expect(actual).toBe("filter[age]=2,4");
  });

  it("converts filters with multiple values", () => {
    const actual = stringify({ filter: { age: [25, 30] } });

    expect(actual).toBe("filter[age]=25,30");
  });

  it("converts Date filter type", () => {
    const isoDate = "2024-01-01T15:00:00.000Z";
    const actual = stringify({ filter: { dateOfBirth: { gte: [new Date(isoDate)] } } });

    expect(actual).toBe(`filter[dateOfBirth][gte]=${isoDate}`);
  });

  it("converts number filter type", () => {
    const actual = stringify({ filter: { age: { gte: [2] } } });

    expect(actual).toBe("filter[age][gte]=2");
  });

  it("converts multiple filter types", () => {
    const actual = stringify({
      filter: {
        age: { eq: 1, ne: 2, gt: 3, gte: 4, lt: 5, lte: 6 },
      },
    });

    expect(actual).toBe(
      "filter[age][eq]=1&filter[age][ne]=2&filter[age][gt]=3&filter[age][gte]=4&filter[age][lt]=5&filter[age][lte]=6",
    );
  });

  it("converts include", () => {
    const actual = stringify({ include: ["article"] });

    expect(actual).toBe("include=article");
  });

  it("converts include with multiple values", () => {
    const actual = stringify({ include: ["articles", "articles.comments"] });

    expect(actual).toBe("include=articles,articles.comments");
  });

  it("converts page", () => {
    const actual = stringify({ page: { size: 10, cursor: "a2c12" } });

    expect(actual).toBe("page[size]=10&page[cursor]=a2c12");
  });

  it("converts limit/offset page", () => {
    const actual = stringify({ page: { limit: 10, number: 2, offset: 20 } });

    expect(actual).toBe("page[limit]=10&page[number]=2&page[offset]=20");
  });

  it("converts sort", () => {
    const actual = stringify({ sort: "age" });

    expect(actual).toBe("sort=age");
  });

  it("converts sort with multiple values", () => {
    const actual = stringify({ sort: ["age", "-dateOfBirth"] });

    expect(actual).toBe("sort=age,-dateOfBirth");
  });

  it("ignores null and undefined filter values", () => {
    const actual = stringify({
      filter: {
        // @ts-expect-error Testing null filter value
        age: null,
        status: { eq: undefined },
      },
    });

    expect(actual).toBe("filter[age]=");
  });

  it("handles single include value", () => {
    const actual = stringify({ include: "article" });

    expect(actual).toBe("include=article");
  });

  it("handles single sort value", () => {
    const actual = stringify({ sort: "-createdAt" });

    expect(actual).toBe("sort=-createdAt");
  });

  it("handles filter with invalid object type", () => {
    const actual = stringify({
      filter: {
        // @ts-expect-error Testing invalid filter value
        invalid: { toString: () => "test" },
      },
    });

    expect(actual).toBe("");
  });

  it("converts combinations", () => {
    const [date1, date2] = [new Date("2024-01-01"), new Date("2024-01-02")];
    const actual = stringify({
      fields: { user: ["age", "dateOfBirth"] },
      filter: {
        age: 2,
        dateOfBirth: { gt: date1, lt: date2 },
        isActive: true,
      },
      include: ["article"],
      page: {
        size: 10,
      },
      sort: "-age",
    });

    expect(actual).toBe(
      "fields[user]=age,dateOfBirth&filter[age]=2&filter[dateOfBirth][gt]=2024-01-01T00:00:00.000Z&filter[dateOfBirth][lt]=2024-01-02T00:00:00.000Z&filter[isActive]=true&include=article&page[size]=10&sort=-age",
    );
  });
});
