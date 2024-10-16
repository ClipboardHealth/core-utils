import {
  type AttributeFields,
  booleanString,
  cursorPaginationQuery,
  fieldsQuery,
  filterQuery,
  includeQuery,
  type JsonApiDocument,
  nonEmptyString,
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
  articles: z.object({
    data: z
      .object({
        id: z.string(),
        type: z.literal(API_TYPES.article),
      })
      .array()
      .max(PAGINATION.size.maximum),
  }),
});

const userAttributes = z.object({
  age: z.coerce.number().int().positive().max(125),
  isActive: booleanString,
  dateOfBirth: z.coerce.date().min(new Date("1900-01-01")).max(new Date()),
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
const includeFields = [
  "articles",
  "articles.comments",
] as const satisfies readonly UserIncludeFields[];

const query = z
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
  tests: {
    description: "Test query parsing.",
    method: "GET",
    path: "/tests",
    query,
    responses: {
      200: query,
    },
  },
});
