import {
  booleanString,
  createCursorPagination,
  createFields,
  createFilter,
  createInclude,
  createSort,
} from "@clipboard-health/json-api-nestjs";
import { z } from "zod";

export const paginationQuery = z.object(createCursorPagination()).strict();

export const fieldsQuery = z
  .object(createFields({ user: ["age", "name"], article: ["title"] }))
  .strict();

export const filterQuery = z
  .object(
    createFilter({
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
  )
  .strict();

export const sortQuery = z.object(createSort(["age", "name"])).strict();

export const includeQuery = z.object(createInclude(["articles", "articles.comments"])).strict();

export const compoundQuery = z.object({
  ...createCursorPagination(),
  ...createFields({ user: ["age", "name"] }),
  ...createFilter({ isActive: { filters: ["eq"], schema: booleanString } }),
  ...createSort(["age"]),
  ...createInclude(["articles"]),
});
