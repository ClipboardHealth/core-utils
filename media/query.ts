import {
  booleanString,
  createCursorPagination,
  createFields,
  createFilter,
  createInclude,
  createSort,
} from "@clipboard-health/json-api-nestjs";
import { z } from "zod";

export const query = z
  .object({
    ...createCursorPagination(),
    ...createFields({ user: ["age", "name"], article: ["title"] }),
    ...createFilter({
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
        schema: z.coerce.date().min(new Date("1900-01-01")),
      },
    }),
    ...createSort(["age", "name"]),
    ...createInclude(["articles", "articles.comments"]),
  })
  .strict();
