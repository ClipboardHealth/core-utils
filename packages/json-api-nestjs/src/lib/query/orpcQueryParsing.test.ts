import { booleanString } from "@clipboard-health/contract-core";
import { OpenAPIHandler } from "@orpc/openapi/fetch";
import { os } from "@orpc/server";
import qs from "qs";
import { z } from "zod";

import { cursorPaginationQuery } from "./cursorPaginationQuery";
import { fieldsQuery } from "./fieldsQuery";
import { filterQuery } from "./filterQuery";
import { includeQuery } from "./includeQuery";
import { sortQuery } from "./sortQuery";

/**
 * Runs the query helpers on the same query strings through both parsers: `qs`, which Express uses
 * for ts-rest services, and oRPC's bracket-notation parser, driven through a real procedure.
 */

const userFields = ["age", "dateOfBirth"] as const;

const query = z
  .object({
    ...cursorPaginationQuery(),
    ...fieldsQuery({ article: ["title"], user: userFields }),
    ...filterQuery({
      age: { filters: ["eq", "gt"], schema: z.coerce.number().int().positive().max(125) },
      dateOfBirth: { filters: ["gte"], schema: z.coerce.date() },
      isActive: { filters: ["eq"], schema: booleanString },
      name: { filters: ["eq", "search"], schema: z.string().min(1) },
    }),
    ...sortQuery(userFields),
    ...includeQuery(["articles", "articles.comments"]),
  })
  .strict();

interface Issue {
  message: string;
  path: Array<number | string>;
}

type Parsed = { data: unknown } | { issues: Issue[] };

const procedure = os
  .$context<{ onInput: (input: unknown) => void }>()
  .route({ inputStructure: "detailed", method: "GET", path: "/users" })
  .input(z.object({ query }))
  .handler(({ context, input }) => {
    context.onInput(input.query);
  });

const handler = new OpenAPIHandler({ list: procedure });

// The same options as `createQueryParser()` in `@clipboard-health/api-nestjs`.
function parseWithQs(queryString: string): Parsed {
  const result = query.safeParse(
    qs.parse(queryString, { allowPrototypes: false, arrayLimit: 1000, parameterLimit: 1000 }),
  );

  return result.success
    ? { data: result.data }
    : { issues: result.error.issues.map(({ message, path }) => ({ message, path })) };
}

async function parseWithOrpc(queryString: string): Promise<Parsed> {
  let data: unknown;
  const { response } = await handler.handle(new Request(`http://localhost/users?${queryString}`), {
    context: { onInput: (input) => (data = input) },
  });

  if (response?.status === 200) {
    return { data };
  }

  expect(response?.status).toBe(400);
  const body = (await response?.json()) as { data: { issues: Issue[] } };

  return {
    issues: body.data.issues.map(({ message, path }) => {
      const [root, ...rest] = path;
      expect(root).toBe("query");

      return { message, path: rest };
    }),
  };
}

const defaultPage = { size: 20 };
const nan = "Expected number, received nan";
function unrecognizedAtRoot(key: string): Parsed {
  return { issues: [{ message: `Unrecognized key(s) in object: '${key}'`, path: [] }] };
}

interface Case {
  expected: Parsed;
  name: string;
  queryString: string;
}

describe("query helpers with oRPC's query parsing", () => {
  describe.each<{ cases: Case[]; helper: string }>([
    {
      helper: "cursorPaginationQuery",
      cases: [
        { name: "defaults page size", queryString: "", expected: { data: { page: defaultPage } } },
        {
          name: "parses page size",
          queryString: "page[size]=1",
          expected: { data: { page: { size: 1 } } },
        },
        {
          name: "parses page cursor",
          queryString: "page[cursor]=abc",
          expected: { data: { page: { size: 20, cursor: "abc" } } },
        },
        {
          name: "decodes a percent-encoded cursor",
          queryString: "page[size]=5&page[cursor]=eyJpZCI6IjEifQ%3D%3D",
          expected: { data: { page: { size: 5, cursor: "eyJpZCI6IjEifQ==" } } },
        },
        {
          name: "decodes percent-encoded brackets",
          queryString: "page%5Bsize%5D=7",
          expected: { data: { page: { size: 7 } } },
        },
        {
          name: "accepts a one-element size list",
          queryString: "page[size][]=3",
          expected: { data: { page: { size: 3 } } },
        },
        {
          name: "rejects size below minimum",
          queryString: "page[size]=0",
          expected: {
            issues: [{ message: "Number must be greater than 0", path: ["page", "size"] }],
          },
        },
        {
          name: "rejects size above maximum",
          queryString: "page[size]=201",
          expected: {
            issues: [
              { message: "Number must be less than or equal to 200", path: ["page", "size"] },
            ],
          },
        },
        {
          name: "rejects non-numeric size",
          queryString: "page[size]=abc",
          expected: { issues: [{ message: nan, path: ["page", "size"] }] },
        },
        {
          name: "rejects empty size",
          queryString: "page[size]=",
          expected: {
            issues: [{ message: "Number must be greater than 0", path: ["page", "size"] }],
          },
        },
        {
          name: "rejects repeated size",
          queryString: "page[size]=10&page[size]=20",
          expected: { issues: [{ message: nan, path: ["page", "size"] }] },
        },
        {
          name: "rejects nested size",
          queryString: "page[size][x]=1",
          expected: { issues: [{ message: nan, path: ["page", "size"] }] },
        },
        {
          name: "rejects nested size in a list",
          queryString: "page[size][][x]=1",
          expected: { issues: [{ message: nan, path: ["page", "size"] }] },
        },
        {
          name: "rejects empty cursor",
          queryString: "page[cursor]=",
          expected: {
            issues: [
              { message: "String must contain at least 1 character(s)", path: ["page", "cursor"] },
            ],
          },
        },
        {
          name: "rejects repeated cursor",
          queryString: "page[cursor]=abc&page[cursor]=def",
          expected: {
            issues: [{ message: "Expected string, received array", path: ["page", "cursor"] }],
          },
        },
        {
          name: "rejects nested cursor",
          queryString: "page[cursor][x]=1",
          expected: {
            issues: [{ message: "Expected string, received object", path: ["page", "cursor"] }],
          },
        },
        {
          name: "rejects a page that is not an object",
          queryString: "page=3",
          expected: {
            issues: [{ message: "Expected object, received string", path: ["page"] }],
          },
        },
        {
          name: "rejects an unknown page key",
          queryString: "page[size]=1&page[number]=2",
          expected: {
            issues: [{ message: "Unrecognized key(s) in object: 'number'", path: ["page"] }],
          },
        },
      ],
    },
    {
      helper: "filterQuery",
      cases: [
        {
          name: "parses a single value as eq",
          queryString: "filter[age]=10",
          expected: { data: { page: defaultPage, filter: { age: { eq: [10] } } } },
        },
        {
          name: "splits comma-separated values",
          queryString: "filter[age]=10,20",
          expected: { data: { page: defaultPage, filter: { age: { eq: [10, 20] } } } },
        },
        {
          name: "splits percent-encoded commas",
          queryString: "filter[age]=10%2C20",
          expected: { data: { page: defaultPage, filter: { age: { eq: [10, 20] } } } },
        },
        {
          name: "decodes percent-encoded brackets",
          queryString: "filter%5Bage%5D%5Bgt%5D=10",
          expected: { data: { page: defaultPage, filter: { age: { gt: [10] } } } },
        },
        {
          name: "merges repeated keys",
          queryString: "filter[age]=10&filter[age]=20",
          expected: { data: { page: defaultPage, filter: { age: { eq: [10, 20] } } } },
        },
        {
          name: "merges empty-bracket keys",
          queryString: "filter[age][]=10&filter[age][]=20",
          expected: { data: { page: defaultPage, filter: { age: { eq: [10, 20] } } } },
        },
        {
          name: "merges indexed keys",
          queryString: "filter[age][0]=10&filter[age][1]=20",
          expected: { data: { page: defaultPage, filter: { age: { eq: [10, 20] } } } },
        },
        {
          name: "merges sparse indexed keys in order",
          queryString: "filter[age][5]=10&filter[age][2]=20",
          expected: { data: { page: defaultPage, filter: { age: { eq: [20, 10] } } } },
        },
        {
          name: "parses an operator",
          queryString: "filter[age][gt]=10",
          expected: { data: { page: defaultPage, filter: { age: { gt: [10] } } } },
        },
        {
          name: "splits comma-separated values for an operator",
          queryString: "filter[age][gt]=10,20",
          expected: { data: { page: defaultPage, filter: { age: { gt: [10, 20] } } } },
        },
        {
          name: "merges repeated operator keys",
          queryString: "filter[age][gt]=10&filter[age][gt]=20",
          expected: { data: { page: defaultPage, filter: { age: { gt: [10, 20] } } } },
        },
        {
          name: "merges empty-bracket operator keys",
          queryString: "filter[age][gt][]=10&filter[age][gt][]=20",
          expected: { data: { page: defaultPage, filter: { age: { gt: [10, 20] } } } },
        },
        {
          name: "merges indexed operator keys",
          queryString: "filter[age][gt][0]=10&filter[age][gt][1]=20",
          expected: { data: { page: defaultPage, filter: { age: { gt: [10, 20] } } } },
        },
        {
          name: "parses an operator followed by a plain value",
          queryString: "filter[age][gt]=10&filter[age]=20",
          expected: { data: { page: defaultPage, filter: { age: { gt: [10], eq: [20] } } } },
        },
        {
          name: "parses an operator followed by an empty-bracket value",
          queryString: "filter[age][gt]=5&filter[age][]=10",
          expected: { data: { page: defaultPage, filter: { age: { gt: [5], eq: [10] } } } },
        },
        {
          name: "parses an empty-bracket value followed by an operator",
          queryString: "filter[age][]=10&filter[age][gt]=5",
          expected: { data: { page: defaultPage, filter: { age: { eq: [10], gt: [5] } } } },
        },
        {
          name: "parses an explicit eq followed by a plain value",
          queryString: "filter[age][eq]=10&filter[age]=20",
          expected: { data: { page: defaultPage, filter: { age: { eq: [10, 20] } } } },
        },
        {
          name: "parses an operator followed by repeated plain values",
          queryString: "filter[age][gt]=5&filter[age]=10&filter[age]=20",
          expected: { data: { page: defaultPage, filter: { age: { gt: [5], eq: [10, 20] } } } },
        },
        {
          name: "parses repeated plain values followed by an operator",
          queryString: "filter[age]=10&filter[age]=20&filter[age][gt]=30",
          expected: { data: { page: defaultPage, filter: { age: { eq: [10, 20], gt: [30] } } } },
        },
        {
          name: "parses an indexed value with an operator",
          queryString: "filter[age][0]=10&filter[age][gt]=5",
          expected: { data: { page: defaultPage, filter: { age: { eq: [10], gt: [5] } } } },
        },
        {
          name: "parses an indexed operator",
          queryString: "filter[age][0][gt]=1",
          expected: { data: { page: defaultPage, filter: { age: { gt: [1] } } } },
        },
        {
          name: "parses a repeated operator followed by a plain value",
          queryString: "filter[age][gt]=5&filter[age][gt]=6&filter[age]=1",
          expected: { data: { page: defaultPage, filter: { age: { gt: [5, 6], eq: [1] } } } },
        },
        {
          name: "parses a boolean",
          queryString: "filter[isActive]=true",
          expected: { data: { page: defaultPage, filter: { isActive: { eq: ["true"] } } } },
        },
        {
          name: "parses a date",
          queryString: "filter[dateOfBirth][gte]=2024-10-10T16:06:12.125Z",
          expected: {
            data: {
              page: defaultPage,
              filter: { dateOfBirth: { gte: [new Date("2024-10-10T16:06:12.125Z")] } },
            },
          },
        },
        {
          name: "keeps commas in a search value",
          queryString: "filter[name][search]=smith,john",
          expected: {
            data: { page: defaultPage, filter: { name: { search: ["smith,john"] } } },
          },
        },
        {
          name: "decodes plus as a space in a search value",
          queryString: "filter[name][search]=john+smith",
          expected: {
            data: { page: defaultPage, filter: { name: { search: ["john smith"] } } },
          },
        },
        {
          name: "joins repeated search keys",
          queryString: "filter[name][search]=a&filter[name][search]=b",
          expected: { data: { page: defaultPage, filter: { name: { search: ["a,b"] } } } },
        },
        {
          name: "parses several fields",
          queryString: "filter[age][gt]=10&filter[isActive]=false&filter[name]=a,b",
          expected: {
            data: {
              page: defaultPage,
              filter: {
                age: { gt: [10] },
                isActive: { eq: ["false"] },
                name: { eq: ["a", "b"] },
              },
            },
          },
        },
        {
          name: "rejects a non-numeric value",
          queryString: "filter[age]=abc",
          expected: { issues: [{ message: nan, path: ["filter", "age", "eq", 0] }] },
        },
        {
          name: "rejects an empty value",
          queryString: "filter[age]=",
          expected: {
            issues: [
              { message: "Number must be greater than 0", path: ["filter", "age", "eq", 0] },
            ],
          },
        },
        {
          name: "rejects a key without a value",
          queryString: "filter[age]",
          expected: {
            issues: [
              { message: "Number must be greater than 0", path: ["filter", "age", "eq", 0] },
            ],
          },
        },
        {
          name: "rejects an empty-bracket value",
          queryString: "filter[age][]=",
          expected: {
            issues: [
              { message: "Number must be greater than 0", path: ["filter", "age", "eq", 0] },
            ],
          },
        },
        {
          name: "rejects an empty operator value",
          queryString: "filter[age][gt]=",
          expected: {
            issues: [
              { message: "Number must be greater than 0", path: ["filter", "age", "gt", 0] },
            ],
          },
        },
        {
          name: "rejects a nested operator value",
          queryString: "filter[age][gt][lt]=1",
          expected: { issues: [{ message: nan, path: ["filter", "age", "gt", 0] }] },
        },
        {
          name: "rejects a nested operator value in a list",
          queryString: "filter[age][gt][0][x]=1",
          expected: { issues: [{ message: nan, path: ["filter", "age", "gt", 0] }] },
        },
        {
          name: "rejects an unknown operator",
          queryString: "filter[age][lt]=1",
          expected: {
            issues: [{ message: "Unrecognized key(s) in object: 'lt'", path: ["filter", "age"] }],
          },
        },
        {
          name: "rejects a nested unknown operator",
          queryString: "filter[age][x][y]=1",
          expected: {
            issues: [{ message: "Unrecognized key(s) in object: 'x'", path: ["filter", "age"] }],
          },
        },
        {
          name: "rejects an unknown field",
          queryString: "filter[height]=1",
          expected: {
            issues: [{ message: "Unrecognized key(s) in object: 'height'", path: ["filter"] }],
          },
        },
        {
          name: "rejects a filter that is not an object",
          queryString: "filter=x",
          expected: {
            issues: [{ message: "Expected object, received string", path: ["filter"] }],
          },
        },
        {
          name: "rejects an invalid boolean",
          queryString: "filter[isActive]=maybe",
          expected: {
            issues: [
              {
                message: "Invalid enum value. Expected 'true' | 'false', received 'maybe'",
                path: ["filter", "isActive", "eq", 0],
              },
            ],
          },
        },
        {
          name: "rejects an invalid date",
          queryString: "filter[dateOfBirth][gte]=notadate",
          expected: {
            issues: [{ message: "Invalid date", path: ["filter", "dateOfBirth", "gte", 0] }],
          },
        },
      ],
    },
    {
      helper: "sortQuery",
      cases: [
        {
          name: "parses one field",
          queryString: "sort=age",
          expected: { data: { page: defaultPage, sort: ["age"] } },
        },
        {
          name: "parses comma-separated fields and descending order",
          queryString: "sort=-age,dateOfBirth",
          expected: { data: { page: defaultPage, sort: ["-age", "dateOfBirth"] } },
        },
        {
          name: "merges repeated keys",
          queryString: "sort=age&sort=-dateOfBirth",
          expected: { data: { page: defaultPage, sort: ["age", "-dateOfBirth"] } },
        },
        {
          name: "merges empty-bracket keys",
          queryString: "sort[]=age&sort[]=-dateOfBirth",
          expected: { data: { page: defaultPage, sort: ["age", "-dateOfBirth"] } },
        },
        {
          name: "merges indexed keys",
          queryString: "sort[0]=age&sort[1]=-dateOfBirth",
          expected: { data: { page: defaultPage, sort: ["age", "-dateOfBirth"] } },
        },
        {
          name: "rejects an empty value",
          queryString: "sort=",
          expected: { issues: [{ message: "Invalid sort field: ''", path: ["sort", "sort", ""] }] },
        },
        {
          name: "rejects an unknown field",
          queryString: "sort=height",
          expected: {
            issues: [{ message: "Invalid sort field: 'height'", path: ["sort", "sort", "height"] }],
          },
        },
        {
          name: "rejects an unknown descending field",
          queryString: "sort=-height",
          expected: {
            issues: [
              { message: "Invalid sort field: '-height'", path: ["sort", "sort", "-height"] },
            ],
          },
        },
        {
          name: "rejects a nested value",
          queryString: "sort[x]=age",
          expected: { issues: [{ message: "Expected array, received object", path: ["sort"] }] },
        },
      ],
    },
    {
      helper: "includeQuery",
      cases: [
        {
          name: "parses one relationship",
          queryString: "include=articles",
          expected: { data: { page: defaultPage, include: ["articles"] } },
        },
        {
          name: "parses comma-separated nested relationships",
          queryString: "include=articles,articles.comments",
          expected: { data: { page: defaultPage, include: ["articles", "articles.comments"] } },
        },
        {
          name: "merges empty-bracket keys",
          queryString: "include[]=articles&include[]=articles.comments",
          expected: { data: { page: defaultPage, include: ["articles", "articles.comments"] } },
        },
        {
          name: "rejects an unknown relationship",
          queryString: "include=bogus",
          expected: {
            issues: [
              { message: "Invalid include field: 'bogus'", path: ["include", "include", "bogus"] },
            ],
          },
        },
        {
          name: "rejects an empty value",
          queryString: "include=",
          expected: {
            issues: [{ message: "Invalid include field: ''", path: ["include", "include", ""] }],
          },
        },
        {
          name: "rejects a nested value",
          queryString: "include[x]=articles",
          expected: { issues: [{ message: "Expected array, received object", path: ["include"] }] },
        },
      ],
    },
    {
      helper: "fieldsQuery",
      cases: [
        {
          name: "parses one field",
          queryString: "fields[user]=age",
          expected: { data: { page: defaultPage, fields: { user: ["age"] } } },
        },
        {
          name: "parses comma-separated fields for several types",
          queryString: "fields[user]=age,dateOfBirth&fields[article]=title",
          expected: {
            data: {
              page: defaultPage,
              fields: { user: ["age", "dateOfBirth"], article: ["title"] },
            },
          },
        },
        {
          name: "merges repeated keys",
          queryString: "fields[user]=age&fields[user]=dateOfBirth",
          expected: { data: { page: defaultPage, fields: { user: ["age", "dateOfBirth"] } } },
        },
        {
          name: "merges empty-bracket keys",
          queryString: "fields[user][]=age&fields[user][]=dateOfBirth",
          expected: { data: { page: defaultPage, fields: { user: ["age", "dateOfBirth"] } } },
        },
        {
          name: "rejects an empty value",
          queryString: "fields[user]=",
          expected: {
            issues: [
              {
                message: "Invalid enum value. Expected 'age' | 'dateOfBirth', received ''",
                path: ["fields", "user", 0],
              },
            ],
          },
        },
        {
          name: "rejects an unknown field",
          queryString: "fields[user]=height",
          expected: {
            issues: [
              {
                message: "Invalid enum value. Expected 'age' | 'dateOfBirth', received 'height'",
                path: ["fields", "user", 0],
              },
            ],
          },
        },
        {
          name: "rejects an unknown type",
          queryString: "fields[comment]=createdAt",
          expected: {
            issues: [{ message: "Unrecognized key(s) in object: 'comment'", path: ["fields"] }],
          },
        },
        {
          name: "rejects fields that are not an object",
          queryString: "fields=user",
          expected: {
            issues: [{ message: "Expected object, received string", path: ["fields"] }],
          },
        },
        {
          name: "rejects a nested value",
          queryString: "fields[user][x]=age",
          expected: {
            issues: [{ message: "Expected array, received object", path: ["fields", "user"] }],
          },
        },
      ],
    },
    {
      helper: "all helpers together",
      cases: [
        {
          name: "parses a realistic query",
          queryString:
            "page[size]=10&page[cursor]=abc&filter[age][gt]=18&filter[isActive]=true&sort=-age&include=articles&fields[user]=age,dateOfBirth",
          expected: {
            data: {
              page: { size: 10, cursor: "abc" },
              filter: { age: { gt: [18] }, isActive: { eq: ["true"] } },
              sort: ["-age"],
              include: ["articles"],
              fields: { user: ["age", "dateOfBirth"] },
            },
          },
        },
        {
          name: "reports every invalid helper",
          queryString: "page[size]=0&filter[age]=abc&sort=height",
          expected: {
            issues: [
              { message: "Number must be greater than 0", path: ["page", "size"] },
              { message: nan, path: ["filter", "age", "eq", 0] },
              { message: "Invalid sort field: 'height'", path: ["sort", "sort", "height"] },
            ],
          },
        },
        {
          name: "rejects an unknown key",
          queryString: "foo=bar",
          expected: unrecognizedAtRoot("foo"),
        },
        {
          name: "rejects an unknown key with brackets",
          queryString: "foo[]=bar",
          expected: unrecognizedAtRoot("foo"),
        },
      ],
    },
  ])("$helper", ({ cases }) => {
    it.each(cases)("$name: $queryString", async ({ expected, queryString }) => {
      const tsRest = parseWithQs(queryString);
      const orpc = await parseWithOrpc(queryString);

      expect(tsRest).toStrictEqual(expected);
      expect(orpc).toStrictEqual(expected);
    });
  });

  describe("differences", () => {
    describe("a plain value followed by a bracketed key on the same key", () => {
      it.each<{ name: string; orpc: Parsed; queryString: string; tsRest: Parsed }>([
        {
          name: "drops the value before an operator",
          queryString: "filter[age]=10&filter[age][gt]=5",
          tsRest: { data: { page: defaultPage, filter: { age: { eq: [10], gt: [5] } } } },
          orpc: { data: { page: defaultPage, filter: { age: { gt: [5] } } } },
        },
        {
          name: "drops the value before an explicit eq",
          queryString: "filter[age]=10&filter[age][eq]=20",
          tsRest: { data: { page: defaultPage, filter: { age: { eq: [10, 20] } } } },
          orpc: { data: { page: defaultPage, filter: { age: { eq: [20] } } } },
        },
        {
          name: "drops the value before an empty-bracket key",
          queryString: "filter[age]=10&filter[age][]=20",
          tsRest: { data: { page: defaultPage, filter: { age: { eq: [10, 20] } } } },
          orpc: { data: { page: defaultPage, filter: { age: { eq: [20] } } } },
        },
        {
          name: "drops values before an operator that precedes later plain values",
          queryString: "filter[age]=10&filter[age][gt]=5&filter[age]=20",
          tsRest: { data: { page: defaultPage, filter: { age: { eq: [10, 20], gt: [5] } } } },
          orpc: { data: { page: defaultPage, filter: { age: { eq: [20], gt: [5] } } } },
        },
        {
          name: "drops the operator value before an empty-bracket key",
          queryString: "filter[age][gt]=1&filter[age][gt][]=2",
          tsRest: { data: { page: defaultPage, filter: { age: { gt: [1, 2] } } } },
          orpc: { data: { page: defaultPage, filter: { age: { gt: [2] } } } },
        },
        {
          name: "drops the sort value before an empty-bracket key",
          queryString: "sort=age&sort[]=-age",
          tsRest: { data: { page: defaultPage, sort: ["age", "-age"] } },
          orpc: { data: { page: defaultPage, sort: ["-age"] } },
        },
      ])("$name: $queryString", async ({ orpc, queryString, tsRest }) => {
        expect(parseWithQs(queryString)).toStrictEqual(tsRest);
        await expect(parseWithOrpc(queryString)).resolves.toStrictEqual(orpc);
      });
    });

    it("keeps both values of an explicit eq and an empty-bracket key, in a different order", async () => {
      const queryString = "filter[age][eq]=10&filter[age][]=20";

      expect(parseWithQs(queryString)).toStrictEqual({
        data: { page: defaultPage, filter: { age: { eq: [20, 10] } } },
      });
      await expect(parseWithOrpc(queryString)).resolves.toStrictEqual({
        data: { page: defaultPage, filter: { age: { eq: [10, 20] } } },
      });
    });

    describe("keys qs drops or tolerates", () => {
      it.each<{ name: string; orpc: Parsed; queryString: string; tsRest: Parsed }>([
        {
          name: "rejects a prototype key that qs drops",
          queryString: "filter[__proto__][x]=1",
          tsRest: { data: { page: defaultPage } },
          orpc: {
            issues: [{ message: "Unrecognized key(s) in object: '__proto__'", path: ["filter"] }],
          },
        },
        {
          name: "rejects an inherited property name that qs drops",
          queryString: "filter[hasOwnProperty]=1",
          tsRest: { data: { page: defaultPage } },
          orpc: {
            issues: [
              { message: "Unrecognized key(s) in object: 'hasOwnProperty'", path: ["filter"] },
            ],
          },
        },
        {
          name: "rejects an empty key that qs drops",
          queryString: "=x",
          tsRest: { data: { page: defaultPage } },
          orpc: { issues: [{ message: "Expected object, received array", path: [] }] },
        },
        {
          name: "rejects an unbalanced closing bracket that qs tolerates",
          queryString: "filter[age]]=10",
          tsRest: { data: { page: defaultPage, filter: { age: { eq: [10] } } } },
          orpc: {
            issues: [{ message: "Unrecognized key(s) in object: 'age]'", path: ["filter"] }],
          },
        },
      ])("$name: $queryString", async ({ orpc, queryString, tsRest }) => {
        expect(parseWithQs(queryString)).toStrictEqual(tsRest);
        await expect(parseWithOrpc(queryString)).resolves.toStrictEqual(orpc);
      });
    });

    it("applies qs's parameter limit but not oRPC's", async () => {
      const queryString = Array.from({ length: 1001 }, () => "filter[age]=1").join("&");

      expect(parseWithQs(queryString)).toStrictEqual({
        data: { page: defaultPage, filter: { age: { eq: Array.from({ length: 1000 }, () => 1) } } },
      });
      await expect(parseWithOrpc(queryString)).resolves.toStrictEqual({
        data: { page: defaultPage, filter: { age: { eq: Array.from({ length: 1001 }, () => 1) } } },
      });
    });
  });
});
