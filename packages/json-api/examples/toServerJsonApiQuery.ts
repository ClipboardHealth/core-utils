import { deepEqual } from "node:assert/strict";

import { type ServerJsonApiQuery, toServerJsonApiQuery } from "@clipboard-health/json-api";

const [date1, date2] = ["2024-01-01", "2024-01-02"];
// The URLSearchParams constructor also supports URL-encoded strings
const searchParams = new URLSearchParams(
  `fields[dog]=name,age&filter[age]=2&filter[createdAt][gt]=${date1}&filter[createdAt][lt]=${date2}&filter[isGoodDog]=true&include=owner&page[size]=10&sort=-age`,
);

const query: ServerJsonApiQuery = toServerJsonApiQuery(searchParams);

deepEqual(query, {
  fields: { dog: ["name", "age"] },
  filter: {
    age: { eq: ["2"] },
    createdAt: { gt: [date1], lt: [date2] },
    isGoodDog: { eq: ["true"] },
  },
  include: ["owner"],
  page: {
    size: "10",
  },
  sort: ["-age"],
});
