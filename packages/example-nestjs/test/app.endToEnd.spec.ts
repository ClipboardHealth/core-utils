import { type INestApplication } from "@nestjs/common";
import { Test, type TestingModule } from "@nestjs/testing";
import { type Express } from "express";
import request from "supertest";

import { AppModule } from "../src/app.module";

describe("/tests", () => {
  const defaultQuery = { page: { size: 20 } };

  let app: INestApplication<Express>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  it("defaults page size if no query string", () =>
    request(app.getHttpServer()).get("/tests").expect(200).expect(defaultQuery));

  it("parses page size", () =>
    request(app.getHttpServer())
      .get("/tests?page[size]=1")
      .expect(200)
      .expect({ page: { size: 1 } }));

  it("parses page cursor", () =>
    request(app.getHttpServer())
      .get("/tests?page[cursor]=abc")
      .expect(200)
      .expect({ page: { size: 20, cursor: "abc" } }));

  it("parses single field value", () =>
    request(app.getHttpServer())
      .get("/tests?fields[user]=age")
      .expect(200)
      .expect({ ...defaultQuery, fields: { user: ["age"] } }));

  it("parses multiple field values", () =>
    request(app.getHttpServer())
      .get("/tests?fields[user]=age,dateOfBirth")
      .expect(200)
      .expect({ ...defaultQuery, fields: { user: ["age", "dateOfBirth"] } }));

  it("parses multiple api type fields", () =>
    request(app.getHttpServer())
      .get("/tests?fields[user]=age,dateOfBirth&fields[article]=title")
      .expect(200)
      .expect({ ...defaultQuery, fields: { user: ["age", "dateOfBirth"], article: ["title"] } }));

  it("parses boolean filter", () =>
    request(app.getHttpServer())
      .get("/tests?filter[isActive]=true")
      .expect(200)
      .expect({ ...defaultQuery, filter: { isActive: { eq: ["true"] } } }));

  it("parses date filter", () =>
    request(app.getHttpServer())
      .get("/tests?filter[dateOfBirth][gte]=2024-10-10T16:06:12.125Z")
      .expect(200)
      .expect({ ...defaultQuery, filter: { dateOfBirth: { gte: ["2024-10-10T16:06:12.125Z"] } } }));

  it("parses single numeric filter value", () =>
    request(app.getHttpServer())
      .get("/tests?filter[age]=10")
      .expect(200)
      .expect({ ...defaultQuery, filter: { age: { eq: [10] } } }));

  it("parses multiple numeric filter values", () =>
    request(app.getHttpServer())
      .get("/tests?filter[age]=10,20")
      .expect(200)
      .expect({ ...defaultQuery, filter: { age: { eq: [10, 20] } } }));

  it("parses numeric filter with filterType", () =>
    request(app.getHttpServer())
      .get("/tests?filter[age][gt]=10")
      .expect(200)
      .expect({ ...defaultQuery, filter: { age: { gt: [10] } } }));

  it("parses numeric filter with multiple filterTypes", () =>
    request(app.getHttpServer())
      .get("/tests?filter[age][gt]=10&filter[age]=20")
      .expect(200)
      .expect({ ...defaultQuery, filter: { age: { gt: [10], eq: [20] } } }));

  it("fails if page size below minimum", async () => {
    const response = await request(app.getHttpServer()).get("/tests?page[size]=0");

    expect(response.status).toBe(400);
    expect(response.body.queryResult.issues[0]).toMatchObject({
      message: "Number must be greater than 0",
      path: ["page", "size"],
    });
  });

  it("fails if page size above maximum", async () => {
    const response = await request(app.getHttpServer()).get("/tests?page[size]=201");

    expect(response.status).toBe(400);
    expect(response.body.queryResult.issues[0]).toMatchObject({
      message: "Number must be less than or equal to 200",
      path: ["page", "size"],
    });
  });

  it("fails if page cursor is empty", async () => {
    const response = await request(app.getHttpServer()).get("/tests?page[cursor]=");

    expect(response.status).toBe(400);
    expect(response.body.queryResult.issues[0]).toMatchObject({
      message: "String must contain at least 1 character(s)",
      path: ["page", "cursor"],
    });
  });

  it("fails if invalid field", async () => {
    const response = await request(app.getHttpServer()).get("/tests?fields[user]=height");

    expect(response.status).toBe(400);
    expect(response.body.queryResult.issues[0]).toMatchObject({
      message: "Invalid enum value. Expected 'age' | 'dateOfBirth', received 'height'",
      path: ["fields", "user", 0],
    });
  });

  it("fails if invalid number filter", async () => {
    const response = await request(app.getHttpServer()).get("/tests?filter[age]=abc");

    expect(response.status).toBe(400);
    expect(response.body.queryResult.issues[0]).toMatchObject({
      message: "Expected number, received nan",
      path: ["filter", "age", "eq", 0],
    });
  });

  it("fails if invalid filter type", async () => {
    const response = await request(app.getHttpServer()).get("/tests?filter[age][lt]=1");

    expect(response.status).toBe(400);
    expect(response.body.queryResult.issues[0]).toMatchObject({
      message: "Unrecognized key(s) in object: 'lt'",
      path: ["filter", "age"],
    });
  });

  it("handles multiple filters using and (&) instead of comma (,)", () =>
    request(app.getHttpServer())
      .get("/tests?filter[age]=10&filter[age]=20")
      .expect(200)
      .expect({ ...defaultQuery, filter: { age: { eq: [10, 20] } } }));

  it("handles multiple filters using and (&) instead of comma (,) with an additional filter type", () =>
    request(app.getHttpServer())
      .get("/tests?filter[age]=10&filter[age]=20&filter[age][gt]=30")
      .expect(200)
      .expect({ ...defaultQuery, filter: { age: { eq: [10, 20], gt: [30] } } }));

  it("fails if invalid boolean filter", async () => {
    const response = await request(app.getHttpServer()).get("/tests?filter[isActive]=1");

    expect(response.status).toBe(400);
    expect(response.body.queryResult.issues[0]).toMatchObject({
      message: "Invalid enum value. Expected 'true' | 'false', received '1'",
      path: ["filter", "isActive", "eq", 0],
    });
  });

  it("fails if invalid date filter", async () => {
    const response = await request(app.getHttpServer()).get(
      "/tests?filter[dateOfBirth]=16:06:12.125",
    );

    expect(response.status).toBe(400);
    expect(response.body.queryResult.issues[0]).toMatchObject({
      message: "Unrecognized key(s) in object: 'eq'",
      path: ["filter", "dateOfBirth"],
    });
  });
});
