import {
  booleanString,
  cursorPaginationQuery,
  fieldsQuery,
  filterQuery,
  includeQuery,
  sortQuery,
} from "@clipboard-health/json-api-nestjs";
import { z } from "zod";

export const query = z
  .object({
    ...cursorPaginationQuery(),
    ...fieldsQuery({ user: ["age", "name"], article: ["title"] }),
    ...filterQuery({
      age: {
        filters: ["eq", "gt"],
        schema: z.coerce.number().int().positive().max(125),
      },
      isActive: {
        filters: ["eq"],
        schema: booleanString,
      },
      dateOfBirth: {
        filters: ["gte"],
        schema: z.coerce.date().min(new Date("1900-01-01")).max(new Date()),
      },
    }),
    ...sortQuery(["age", "name"]),
    ...includeQuery(["articles", "articles.comments"]),
  })
  .strict();
