import { deepEqual } from "node:assert/strict";

import { toClientSearchParams } from "@clipboard-health/json-api";

import { type ClientJsonApiQuery } from "../src/lib/types";

const [date1, date2] = ["2024-01-01", "2024-01-02"];
const query: ClientJsonApiQuery = {
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
};

deepEqual(
  toClientSearchParams(query).toString(),
  new URLSearchParams(
    `fields[dog]=name,age&filter[age]=2&filter[createdAt][gt]=${date1}&filter[createdAt][lt]=${date2}&filter[isGoodDog]=true&include=owner&page[size]=10&sort=-age`,
  ).toString(),
);
