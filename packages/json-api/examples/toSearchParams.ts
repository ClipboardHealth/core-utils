import { deepEqual } from "node:assert/strict";

import { toSearchParams } from "@clipboard-health/json-api";

import { type ClientJsonApiQuery } from "../src/lib/types";

const isoDate = "2024-01-01T15:00:00.000Z";
const query: ClientJsonApiQuery = {
  fields: { dog: ["age"] },
  filter: { age: [2], createdAt: { gte: new Date(isoDate) }, isGoodDog: true },
  include: ["owner"],
  page: { size: 10 },
  sort: ["-age"],
};

deepEqual(
  toSearchParams(query).toString(),
  new URLSearchParams(
    "fields[dog]=age&filter[age]=2&filter[createdAt][gte]=2024-01-01T15:00:00.000Z&filter[isGoodDog]=true&include=owner&page[size]=10&sort=-age",
  ).toString(),
);
