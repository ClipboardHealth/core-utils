// packages/json-api/src/lib/query/toServerJsonApiQuery.ts
import { deepEqual } from "node:assert/strict";

import { type ServerJsonApiQuery, toServerJsonApiQuery } from "@clipboard-health/json-api";

const [date1, date2] = ["2024-01-01", "2024-01-02"];
// The URLSearchParams constructor also supports URL-encoded strings
const searchParams = new URLSearchParams(
  `fields[user]=age,dateOfBirth&filter[age]=2&filter[dateOfBirth][gt]=${date1}&filter[dateOfBirth][lt]=${date2}&filter[isActive]=true&include=article&page[size]=10&sort=-age`,
);

const query: ServerJsonApiQuery = toServerJsonApiQuery(searchParams);

deepEqual(query, {
  fields: { user: ["age", "dateOfBirth"] },
  filter: {
    age: { eq: ["2"] },
    dateOfBirth: { gt: [date1], lt: [date2] },
    isActive: { eq: ["true"] },
  },
  include: ["article"],
  page: {
    size: "10",
  },
  sort: ["-age"],
});
