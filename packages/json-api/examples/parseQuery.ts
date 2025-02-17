// packages/json-api/src/lib/query/parseQuery.ts,packages/json-api/README.md
import { deepEqual } from "node:assert/strict";

import { parseQuery } from "@clipboard-health/json-api";
import { type ParsedQs } from "qs";

const [date1, date2] = ["2024-01-01", "2024-01-02"];
// The URLSearchParams constructor also supports URL-encoded strings
const searchParams = new URLSearchParams(
  `fields[user]=age,dateOfBirth&filter[age]=2&filter[dateOfBirth][gt]=${date1}&filter[dateOfBirth][lt]=${date2}&filter[isActive]=true&include=article&page[size]=10&sort=-age`,
);

const query: ParsedQs = parseQuery(searchParams.toString());

deepEqual(query, {
  fields: { user: ["age", "dateOfBirth"] },
  filter: {
    age: "2",
    dateOfBirth: { gt: date1, lt: date2 },
    isActive: "true",
  },
  include: "article",
  page: {
    size: "10",
  },
  sort: "-age",
});
