import { booleanString, nonEmptyString } from "@clipboard-health/contract-core";
import {
  type AttributeFields,
  cursorPaginationQuery,
  fieldsQuery,
  type FilterMap,
  filterQuery,
  includeQuery,
  type JsonApiDocument,
  PAGINATION,
  type RelationshipPaths,
  sortQuery,
} from "@clipboard-health/json-api-nestjs";
import { initContract } from "@ts-rest/core";
import z from "zod";

const API_TYPES = {
  article: "article",
  comment: "comment",
  user: "user",
} as const;

const userType = z.literal(API_TYPES.user);

const userRelationships = z.object({
  articles: z
    .object({
      data: z
        .object({
          id: z.string(),
          type: z.literal(API_TYPES.article),
        })
        .array()
        .max(PAGINATION.size.maximum),
    })
    .optional(),
});

const userAttributes = z.object({
  age: z.coerce.number().int().positive().max(125),
  dateOfBirth: z.coerce.date().min(new Date("1900-01-01")).max(new Date()),
  isActive: booleanString,
});

const createUser = z.object({
  data: z.object({
    attributes: userAttributes,
    relationships: userRelationships,
    type: userType,
  }),
});

const user = z.object({
  data: z.object({
    attributes: userAttributes,
    id: z.string(),
    relationships: userRelationships,
    type: z.literal(API_TYPES.user),
  }),
});

const article = z.object({
  data: z.object({
    attributes: z.object({
      title: nonEmptyString,
    }),
    id: z.string(),
    relationships: z.object({
      comments: z.object({
        data: z
          .object({
            id: z.string(),
            type: z.literal(API_TYPES.comment),
          })
          .array()
          .max(PAGINATION.size.maximum),
      }),
    }),
    type: z.literal(API_TYPES.article),
  }),
});

const comment = z.object({
  data: z.object({
    attributes: z.object({
      createdAt: z.string().datetime(),
    }),
    id: z.string(),
    relationships: z.object({
      user: z.object({
        data: z.object({
          id: z.string(),
          type: z.literal(API_TYPES.user),
        }),
      }),
    }),
    type: z.literal(API_TYPES.comment),
  }),
});

const API_SCHEMAS = {
  [API_TYPES.article]: article,
  [API_TYPES.comment]: comment,
  [API_TYPES.user]: user,
} as const;

type IncludeFields<T extends JsonApiDocument> = RelationshipPaths<typeof API_SCHEMAS, T, 2>;

export type UserDto = z.infer<typeof user>;
export type UserAttributeFields = AttributeFields<UserDto>;
export type UserIncludeFields = IncludeFields<UserDto>;

type ArticleDto = z.infer<typeof article>;
export type ArticleAttributeFields = AttributeFields<ArticleDto>;
export type ArticleIncludeFields = IncludeFields<ArticleDto>;

type CommentDto = z.infer<typeof comment>;
export type CommentIncludeFields = IncludeFields<CommentDto>;

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

const query = z
  .object({
    ...cursorPaginationQuery(),
    ...fieldsQuery({ article: articleFields, user: userFields }),
    ...filterQuery(userFilterMap),
    ...sortQuery(userFields),
    ...includeQuery(userIncludeFields),
  })
  .strict();

export const contract = initContract().router({
  create: {
    body: createUser,
    description: "Create a user.",
    method: "POST",
    path: "/users",
    responses: {
      201: user,
    },
  },
  list: {
    description: "List users.",
    method: "GET",
    path: "/users",
    query,
    responses: {
      // Return the query object to easily test query parsing.
      200: query,
    },
  },
});
