// embedex: packages/json-api/src/lib/query/stringifyQuery.ts,packages/json-api/README.md
import { deepEqual } from "node:assert/strict";

import { stringifyQuery } from "@clipboard-health/json-api";

import { type ClientJsonApiQuery } from "../src/lib/types";

const [date1, date2] = ["2024-01-01", "2024-01-02"];
const query: ClientJsonApiQuery = {
  fields: { user: ["age", "dateOfBirth"] },
  filter: {
    age: 2,
    dateOfBirth: {
      gt: date1,
      lt: date2,
    },
    isActive: true,
  },
  include: "article",
  page: {
    size: 10,
  },
  sort: "-age",
};

deepEqual(
  stringifyQuery(query),
  new URLSearchParams(
    `fields[user]=age,dateOfBirth&filter[age]=2&filter[dateOfBirth][gt]=${date1}&filter[dateOfBirth][lt]=${date2}&filter[isActive]=true&include=article&page[size]=10&sort=-age`,
  ).toString(),
);
