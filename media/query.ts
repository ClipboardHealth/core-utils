import {
  booleanString,
  cursorPaginationQuery,
  fieldsQuery,
  filterQuery,
  includeQuery,
  sortQuery,
} from "@clipboard-health/json-api-nestjs";
import { z } from "zod";

import {
  type ArticleAttributeFields,
  type UserAttributeFields,
  type UserIncludeFields,
} from "./contract";

const articleFields = ["title"] as const satisfies readonly ArticleAttributeFields[];
const userFields = ["age", "name"] as const satisfies readonly UserAttributeFields[];
const includeFields = [
  "articles",
  "articles.comments",
] as const satisfies readonly UserIncludeFields[];

/**
 * Disclaimer: Just because JSON:API supports robust querying doesn’t mean your service should
 * implement them as they may require database indexes, which have a cost. **Implement only access
 * patterns required by clients.**
 *
 * The spec says that if clients provide fields the server doesn’t support, it **MUST** return 400
 * Bad Request, hence the `.strict()`.
 */
export const query = z
  .object({
    ...cursorPaginationQuery(),
    ...fieldsQuery({ user: userFields, article: articleFields }),
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
    ...sortQuery(userFields),
    ...includeQuery(includeFields),
  })
  .strict();
