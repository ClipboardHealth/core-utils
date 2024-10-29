import { type INestApplication } from "@nestjs/common";
import { Test, type TestingModule } from "@nestjs/testing";
import { type Express } from "express";
import request from "supertest";

import { AppModule } from "../src/app.module";

describe("GET /users", () => {
  let app: INestApplication<Express>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  const defaultQuery = { page: { size: 20 } };
  it.each<{ expected: Record<string, unknown>; input: string; name: string }>([
    {
      name: "defaults page size if no query string",
      input: "/users",
      expected: defaultQuery,
    },
    {
      name: "parses page size",
      input: "/users?page[size]=1",
      expected: { page: { size: 1 } },
    },
    {
      name: "parses page cursor",
      input: "/users?page[cursor]=abc",
      expected: { page: { size: 20, cursor: "abc" } },
    },
    {
      name: "parses single field value",
      input: "/users?fields[user]=age",
      expected: { ...defaultQuery, fields: { user: ["age"] } },
    },
    {
      name: "parses multiple field values",
      input: "/users?fields[user]=age,dateOfBirth",
      expected: { ...defaultQuery, fields: { user: ["age", "dateOfBirth"] } },
    },
    {
      name: "parses multiple api type fields",
      input: "/users?fields[user]=age,dateOfBirth&fields[article]=title",
      expected: { ...defaultQuery, fields: { user: ["age", "dateOfBirth"], article: ["title"] } },
    },
    {
      name: "parses boolean filter",
      input: "/users?filter[isActive]=true",
      expected: { ...defaultQuery, filter: { isActive: { eq: ["true"] } } },
    },
    {
      name: "parses date filter",
      input: "/users?filter[dateOfBirth][gte]=2024-10-10T16:06:12.125Z",
      expected: { ...defaultQuery, filter: { dateOfBirth: { gte: ["2024-10-10T16:06:12.125Z"] } } },
    },
    {
      name: "parses single numeric filter value",
      input: "/users?filter[age]=10",
      expected: { ...defaultQuery, filter: { age: { eq: [10] } } },
    },
    {
      name: "parses multiple numeric filter values",
      input: "/users?filter[age]=10,20",
      expected: { ...defaultQuery, filter: { age: { eq: [10, 20] } } },
    },
    {
      name: "parses numeric filter with filterType",
      input: "/users?filter[age][gt]=10",
      expected: { ...defaultQuery, filter: { age: { gt: [10] } } },
    },
    {
      name: "parses numeric filter with multiple filterTypes",
      input: "/users?filter[age][gt]=10&filter[age]=20",
      expected: { ...defaultQuery, filter: { age: { gt: [10], eq: [20] } } },
    },
    {
      name: "handles multiple filters using '&'",
      input: "/users?filter[age]=10&filter[age]=20",
      expected: { ...defaultQuery, filter: { age: { eq: [10, 20] } } },
    },
    {
      name: "handles multiple filters using '&' with an additional filter type",
      input: "/users?filter[age]=10&filter[age]=20&filter[age][gt]=30",
      expected: { ...defaultQuery, filter: { age: { eq: [10, 20], gt: [30] } } },
    },
  ])("$name", async ({ input, expected }) => {
    const response = await request(app.getHttpServer()).get(input);

    expect(response.status).toBe(200);
    expect(response.body).toEqual(expected);
  });

  it.each<{
    error: { message: string; path: Array<string | number> };
    input: string;
    name: string;
  }>([
    {
      name: "fails if page size below minimum",
      input: "/users?page[size]=0",
      error: {
        message: "Number must be greater than 0",
        path: ["page", "size"],
      },
    },
    {
      name: "fails if page size above maximum",
      input: "/users?page[size]=201",
      error: {
        message: "Number must be less than or equal to 200",
        path: ["page", "size"],
      },
    },
    {
      name: "fails if page cursor is empty",
      input: "/users?page[cursor]=",
      error: {
        message: "String must contain at least 1 character(s)",
        path: ["page", "cursor"],
      },
    },
    {
      name: "fails if invalid field",
      input: "/users?fields[user]=height",
      error: {
        message: "Invalid enum value. Expected 'age' | 'dateOfBirth', received 'height'",
        path: ["fields", "user", 0],
      },
    },
    {
      name: "fails if invalid number filter",
      input: "/users?filter[age]=abc",
      error: {
        message: "Expected number, received nan",
        path: ["filter", "age", "eq", 0],
      },
    },
    {
      name: "fails if invalid filter type",
      input: "/users?filter[age][lt]=1",
      error: {
        message: "Unrecognized key(s) in object: 'lt'",
        path: ["filter", "age"],
      },
    },
    {
      name: "fails if invalid boolean filter",
      input: "/users?filter[isActive]=1",
      error: {
        message: "Invalid enum value. Expected 'true' | 'false', received '1'",
        path: ["filter", "isActive", "eq", 0],
      },
    },
    {
      name: "fails if invalid date filter",
      input: "/users?filter[dateOfBirth]=16:06:12.125",
      error: {
        message: "Unrecognized key(s) in object: 'eq'",
        path: ["filter", "dateOfBirth"],
      },
    },
  ])("$name", async ({ input, error: { message, path } }) => {
    const response = await request(app.getHttpServer()).get(input);

    expect(response.status).toBe(400);
    expect(response.body.queryResult.issues[0]).toMatchObject({ message, path });
  });
});
