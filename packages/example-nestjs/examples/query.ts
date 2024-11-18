// packages/json-api-nestjs/src/lib/query/cursorPaginationQuery.ts,packages/json-api-nestjs/src/lib/query/fieldsQuery.ts,packages/json-api-nestjs/src/lib/query/filterQuery.ts,packages/json-api-nestjs/src/lib/query/includeQuery.ts,packages/json-api-nestjs/src/lib/query/sortQuery.ts
import { booleanString } from "@clipboard-health/contract-core";
import {
  cursorPaginationQuery,
  fieldsQuery,
  type FilterMap,
  filterQuery,
  includeQuery,
  sortQuery,
} from "@clipboard-health/json-api-nestjs";
import { z } from "zod";

import {
  type ArticleAttributeFields,
  type UserAttributeFields,
  type UserIncludeFields,
} from "../src/contract";

const articleFields = ["title"] as const satisfies readonly ArticleAttributeFields[];
const userFields = ["age", "dateOfBirth"] as const satisfies readonly UserAttributeFields[];
const userIncludeFields = [
  "articles",
  "articles.comments",
] as const satisfies readonly UserIncludeFields[];
const userFilterMap = {
  age: {
    filters: ["eq", "gt"],
    schema: z.coerce.number().int().positive().max(125),
  },
  dateOfBirth: {
    filters: ["gte"],
    schema: z.coerce.date().min(new Date("1900-01-01")).max(new Date()),
  },
  isActive: {
    filters: ["eq"],
    schema: booleanString,
  },
} as const satisfies FilterMap<UserAttributeFields>;

export const query = z
  .object({
    ...cursorPaginationQuery(),
    ...fieldsQuery({ article: articleFields, user: userFields }),
    ...filterQuery(userFilterMap),
    ...sortQuery(userFields),
    ...includeQuery(userIncludeFields),
  })
  .strict();