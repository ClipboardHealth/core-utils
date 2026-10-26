import type { NestExpressApplication } from "@nestjs/platform-express";
import { Test, type TestingModule } from "@nestjs/testing";
import qs from "qs";
import request from "supertest";

import { AppModule } from "../src/app.module";

interface Issue {
  message: string;
  path: Array<number | string>;
}

describe("GET /orpc/users", () => {
  let app: NestExpressApplication;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication<NestExpressApplication>();
    app.set("query parser", (queryString: string) =>
      qs.parse(queryString, {
        allowPrototypes: true,
        arrayLimit: 100,
      }),
    );
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  const defaultQuery = { page: { size: 20 } };

  it.each<{ expected: Record<string, unknown>; name: string; queryString: string }>([
    {
      name: "defaults page size if no query string",
      queryString: "",
      expected: defaultQuery,
    },
    {
      name: "parses page size and cursor",
      queryString: "page[size]=1&page[cursor]=abc",
      expected: { page: { size: 1, cursor: "abc" } },
    },
    {
      name: "parses multiple field values",
      queryString: "fields[user]=age,dateOfBirth&fields[article]=title",
      expected: { ...defaultQuery, fields: { user: ["age", "dateOfBirth"], article: ["title"] } },
    },
    {
      name: "parses multiple numeric filter values",
      queryString: "filter[age]=10,20",
      expected: { ...defaultQuery, filter: { age: { eq: [10, 20] } } },
    },
    {
      name: "parses numeric filter with multiple filterTypes",
      queryString: "filter[age][gt]=10&filter[age]=20",
      expected: { ...defaultQuery, filter: { age: { gt: [10], eq: [20] } } },
    },
    {
      name: "handles multiple filters using '&'",
      queryString: "filter[age]=10&filter[age]=20&filter[age][gt]=30",
      expected: { ...defaultQuery, filter: { age: { eq: [10, 20], gt: [30] } } },
    },
    {
      name: "parses indexed filter values",
      queryString: "filter[age][0]=10&filter[age][1]=20",
      expected: { ...defaultQuery, filter: { age: { eq: [10, 20] } } },
    },
    {
      name: "parses sort and include",
      queryString: "sort=-age,dateOfBirth&include=articles,articles.comments",
      expected: {
        ...defaultQuery,
        sort: ["-age", "dateOfBirth"],
        include: ["articles", "articles.comments"],
      },
    },
  ])("$name: $queryString", async ({ queryString, expected }) => {
    const orpcResponse = await request(app.getHttpServer()).get(`/orpc/users?${queryString}`);
    const tsRestResponse = await request(app.getHttpServer()).get(`/users?${queryString}`);

    expect(orpcResponse.status).toBe(200);
    expect(orpcResponse.body).toStrictEqual(expected);
    expect(orpcResponse.body).toStrictEqual(tsRestResponse.body);
  });

  it.each<{ error: Issue; name: string; queryString: string }>([
    {
      name: "fails if page size above maximum",
      queryString: "page[size]=201",
      error: { message: "Number must be less than or equal to 200", path: ["page", "size"] },
    },
    {
      name: "fails if nested page size",
      queryString: "page[size][x]=1",
      error: { message: "Expected number, received nan", path: ["page", "size"] },
    },
    {
      name: "fails if invalid field",
      queryString: "fields[user]=height",
      error: {
        message: "Invalid enum value. Expected 'age' | 'dateOfBirth', received 'height'",
        path: ["fields", "user", 0],
      },
    },
    {
      name: "fails if invalid number filter",
      queryString: "filter[age]=abc",
      error: { message: "Expected number, received nan", path: ["filter", "age", "eq", 0] },
    },
    {
      name: "fails if nested filter value",
      queryString: "filter[age][gt][lt]=1",
      error: { message: "Expected number, received nan", path: ["filter", "age", "gt", 0] },
    },
    {
      name: "fails if invalid filter type",
      queryString: "filter[age][lt]=1",
      error: { message: "Unrecognized key(s) in object: 'lt'", path: ["filter", "age"] },
    },
  ])("$name: $queryString", async ({ queryString, error: { message, path } }) => {
    const orpcResponse = await request(app.getHttpServer()).get(`/orpc/users?${queryString}`);
    const tsRestResponse = await request(app.getHttpServer()).get(`/users?${queryString}`);

    expect(orpcResponse.status).toBe(400);
    expect(orpcResponse.body.data.issues[0]).toMatchObject({ message, path: ["query", ...path] });
    expect(tsRestResponse.status).toBe(400);
    expect(tsRestResponse.body.queryResult.issues[0]).toMatchObject({ message, path });
  });
});
