import {
  type AttributeFields,
  type JsonApiDocument,
  nonEmptyString,
  type RelationshipPaths,
} from "@clipboard-health/json-api-nestjs";
import { z } from "zod";

const API_TYPES = {
  article: "article",
  comment: "comment",
  user: "user",
} as const;

const article = z.object({
  data: z.object({
    attributes: z.object({
      title: nonEmptyString,
    }),
    id: z.string(),
    relationships: z.object({
      comments: z.object({
        data: z.array(
          z.object({
            id: z.string(),
            type: z.literal(API_TYPES.comment),
          }),
        ),
      }),
    }),
    type: z.literal(API_TYPES.article),
  }),
});

const user = z.object({
  data: z.object({
    attributes: z.object({
      age: z.coerce.number().int().positive().max(125),
      name: nonEmptyString,
    }),
    id: z.string(),
    relationships: z.object({
      articles: z.object({
        data: z.array(
          z.object({
            id: z.string(),
            type: z.literal(API_TYPES.article),
          }),
        ),
      }),
    }),
    type: z.literal(API_TYPES.user),
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

export type ArticleDto = z.infer<typeof article>;
export type ArticleAttributeFields = AttributeFields<ArticleDto>;
export type ArticleIncludeFields = IncludeFields<ArticleDto>;

export type UserDto = z.infer<typeof user>;
export type UserAttributeFields = AttributeFields<UserDto>;
export type UserIncludeFields = IncludeFields<UserDto>;

export type CommentDto = z.infer<typeof comment>;
export type CommentAttributeFields = AttributeFields<CommentDto>;
export type CommentIncludeFields = IncludeFields<CommentDto>;
