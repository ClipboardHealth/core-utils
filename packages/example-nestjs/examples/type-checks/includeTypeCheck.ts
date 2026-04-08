import { type z } from "zod";

import {
  type ArticleIncludeFields,
  type CommentIncludeFields,
  type UserIncludeFields,
} from "../../src/contract";
import { type query } from "../query";

type Include = z.infer<typeof query.shape.include>;
// @ts-expect-error: unused
let _typeCheck: Include | undefined;
//  ^? let _typeCheck: ("articles" | "articles.comments")[] | undefined

// @ts-expect-error: unused
const _validSingleInclude: Include = ["articles"];

// @ts-expect-error: unused
const _validMultipleIncludes: Include = ["articles", "articles.comments"];

// @ts-expect-error: invalid
const _invalidIncludeField: Include = ["invalid"];

// @ts-expect-error: invalid
const _invalidIncludeDataType: Include = "articles";

// @ts-expect-error: unused
let _includeUserFieldsTypeCheck: UserIncludeFields | undefined;
//  ^? let _includeUserFieldsTypeCheck: "articles" | "articles.comments" | undefined

// @ts-expect-error: unused
let _includeArticleFieldsTypeCheck: ArticleIncludeFields | undefined;
//  ^? let _includeArticleFieldsTypeCheck: "comments" | "comments.user" | undefined

// @ts-expect-error: unused
let _includeCommentFieldsTypeCheck: CommentIncludeFields | undefined;
//  ^? let _includeCommentFieldsTypeCheck: "user" | "user.articles" | undefined
