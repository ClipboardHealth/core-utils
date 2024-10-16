/* eslint-disable @typescript-eslint/no-unused-vars */
import { type z } from "zod";

import {
  type ArticleIncludeFields,
  type CommentIncludeFields,
  type UserIncludeFields,
} from "../../src/contract";
import { type query } from "../query";

type Include = z.infer<typeof query.shape.include>;
let _typeCheck: Include | undefined;
//  ^? let _typeCheck: ("articles" | "articles.comments")[] | undefined

const _validSingleInclude: Include = ["articles"];

const _validMultipleIncludes: Include = ["articles", "articles.comments"];

// @ts-expect-error: invalid
const _invalidIncludeField: Include = ["invalid"];

// @ts-expect-error: invalid
const _invalidIncludeDataType: Include = "articles";

let _includeUserFieldsTypeCheck: UserIncludeFields | undefined;
//  ^? let _includeUserFieldsTypeCheck: "articles" | "articles.comments" | undefined

let _includeArticleFieldsTypeCheck: ArticleIncludeFields | undefined;
//  ^? let _includeArticleFieldsTypeCheck: "comments" | "comments.user" | undefined

let _includeCommentFieldsTypeCheck: CommentIncludeFields | undefined;
//  ^? let _includeCommentFieldsTypeCheck: "user" | "user.articles" | undefined
/* eslint-enable @typescript-eslint/no-unused-vars */
