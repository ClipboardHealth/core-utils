import {
  booleanString,
  createCursorPagination,
  createFields,
  createFilter,
} from "@clipboard-health/json-api-nestjs";
import { z } from "zod";

export const paginationQuery = z.object(createCursorPagination()).strict();

export const fieldsQuery = z
  .object(createFields({ user: ["name", "age"], post: ["title"] }))
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

export const complexQuery = z.object({
  ...createCursorPagination(),
  ...createFields({ user: ["name", "age"] }),
  ...createFilter({ isActive: { filters: ["eq"], schema: booleanString } }),
});
