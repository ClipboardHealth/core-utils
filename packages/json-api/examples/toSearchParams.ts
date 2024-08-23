import { toSearchParams } from "@clipboard-health/json-api";

import { type JsonApiQuery } from "../src/lib/types";

const query: JsonApiQuery = {
  fields: { dog: ["age", "name"] },
  filter: { age: ["2", "5"] },
  include: ["vet"],
  page: { size: "10" },
  sort: ["-age"],
};

console.log(toSearchParams(query).toString());
// Note: actual result is URL-encoded, but unencoded below for readability
// => fields[dog]=age,name&filter[age]=2,5&include=vet&page[size]=10&sort=-age
