# @clipboard-health/json-api-nestjs

Utilities for adhering to the [JSON:API](https://jsonapi.org/) specification with [NestJS](https://nestjs.com/).

## Table of Contents

- [Install](#install)
- [Usage](#usage)
  - [Query helpers](#query-helpers)
- [Local development commands](#local-development-commands)

## Install

```bash
npm install @clipboard-health/json-api-nestjs
```

## Usage

### Query helpers

Create Zod schemas for your API's queries:

<!-- prettier-ignore -->
```ts
// ./examples/query.ts

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

```

## Local development commands

See [`package.json`](./package.json) `scripts` for a list of commands.
