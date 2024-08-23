import { deepEqual } from "node:assert/strict";

import { type ServerJsonApiQuery, toJsonApiQuery } from "@clipboard-health/json-api";

const isoDate = "2024-01-01T15:00:00.000Z";
// The URLSearchParams constructor also supports URL-encoded strings
const searchParams = new URLSearchParams(
  `fields[dog]=age&filter[age]=2&filter[createdAt][gte]=${isoDate}&filter[isGoodDog]=true&include=owner&page[size]=10&sort=-age`,
);

const query: ServerJsonApiQuery = toJsonApiQuery(searchParams);

deepEqual(query, {
  fields: { dog: ["age"] },
  filter: { age: ["2"], createdAt: { gte: isoDate }, isGoodDog: ["true"] },
  include: ["owner"],
  page: {
    size: "10",
  },
  sort: ["-age"],
});
