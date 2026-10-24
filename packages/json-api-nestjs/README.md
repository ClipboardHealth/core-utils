# @clipboard-health/json-api-nestjs <!-- omit from toc -->

TypeScript-friendly utilities for adhering to the [JSON:API](https://jsonapi.org/) specification with [NestJS](https://nestjs.com/).

## Table of contents <!-- omit from toc -->

- [Install](#install)
- [Usage](#usage)
  - [Query helpers](#query-helpers)
  - [Express query parser](#express-query-parser)
- [Local development commands](#local-development-commands)

## Install

```bash
npm install @clipboard-health/json-api-nestjs
```

## Usage

### Query helpers

Create Zod schemas for your API's queries:

<embedex source="packages/example-nestjs/examples/query.ts">

```ts
import { booleanString } from "@clipboard-health/contract-core";
import {
  cursorPaginationQuery,
  fieldsQuery,
  type FilterMap,
  filterQuery,
  includeQuery,
  sortQuery,
} from "@clipboard-health/json-api-nestjs";
import { z } from "zod";

import type {
  ArticleAttributeFields,
  UserAttributeFields,
  UserIncludeFields,
} from "../src/contract";

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
    ...fieldsQuery({ article: articleFields, user: userFields }),
    ...filterQuery(userFilterMap),
    ...sortQuery(userFields),
    ...includeQuery(userIncludeFields),
  })
  .strict();
```

</embedex>

### Express query parser

The query helpers expect `req.query` to hold nested objects: `?filter[age][gt]=10` must arrive as
`{ filter: { age: { gt: "10" } } }`. Express 5's default `simple` query parser leaves
`filter[age][gt]` as one flat key, so the helpers reject the query. Set a `qs` query parser on the
Nest app.

Clipboard services can use `createQueryParser()` from `@clipboard-health/api-nestjs`:

```ts
import { createQueryParser } from "@clipboard-health/api-nestjs";
import { NestFactory } from "@nestjs/core";
import { type NestExpressApplication } from "@nestjs/platform-express";

import { AppModule } from "./app.module";

const app = await NestFactory.create<NestExpressApplication>(AppModule);
app.set("query parser", createQueryParser());
await app.listen(3000);
```

Other apps can pass a function that calls [`qs`](https://github.com/ljharb/qs)'s `parse` instead,
for example `app.set("query parser", (query: string) => qs.parse(query))`.

oRPC routes don't read `req.query`: oRPC parses their query strings itself, with its own bracket
notation.

## Local development commands

See [`package.json`](./package.json) `scripts` for a list of commands.
