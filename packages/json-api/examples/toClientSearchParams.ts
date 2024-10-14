import { deepEqual } from "node:assert/strict";

import { toClientSearchParams } from "@clipboard-health/json-api";

import { type ClientJsonApiQuery } from "../src/lib/types";

const [date1, date2] = ["2024-01-01", "2024-01-02"];
const query: ClientJsonApiQuery = {
  fields: { user: ["age", "name"] },
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
};

deepEqual(
  toClientSearchParams(query).toString(),
  new URLSearchParams(
    `fields[user]=age,name&filter[age]=2&filter[dateOfBirth][gt]=${date1}&filter[dateOfBirth][lt]=${date2}&filter[isActive]=true&include=article&page[size]=10&sort=-age`,
  ).toString(),
);
