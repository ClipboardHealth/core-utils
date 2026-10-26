# @clipboard-health/json-api-nestjs <!-- omit from toc -->

TypeScript-friendly utilities for adhering to the [JSON:API](https://jsonapi.org/) specification with [NestJS](https://nestjs.com/).

## Table of contents <!-- omit from toc -->

- [Install](#install)
- [Usage](#usage)
  - [Query helpers](#query-helpers)
  - [Express query parser](#express-query-parser)
  - [oRPC procedures](#orpc-procedures)
    - [Differences from qs](#differences-from-qs)
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
`filter[age][gt]` as one flat key, so a `.strict()` query schema rejects the query with a 400 and a
non-strict one silently drops the filter and pagination.

Set a `qs` query parser on the Nest app. Clipboard services can use `createQueryParser()` from
`@clipboard-health/api-nestjs` 17.0.0 or later:

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

oRPC routes don't need the setting: they don't read `req.query`. See [oRPC procedures](#orpc-procedures).

### oRPC procedures

The query helpers work in [oRPC](https://orpc.dev) procedures. oRPC parses the query string itself, so
declare the procedure with `inputStructure: "detailed"` and put the helpers' schema under `query`:

```ts
import { oc } from "@orpc/contract";
import { z } from "zod";

const query = z
  .object({
    ...cursorPaginationQuery(),
    ...filterQuery(userFilterMap),
    ...sortQuery(userFields),
  })
  .strict();

export const list = oc
  .route({ inputStructure: "detailed", method: "GET", path: "/users" })
  .input(z.object({ query }));
```

For the same query string, the helpers return the same values and the same validation issues as with
`qs` and ts-rest, apart from the differences below. Issue paths in an oRPC 400 start with `query`.
[`orpcQueryParsing.test.ts`](./src/lib/query/orpcQueryParsing.test.ts) runs each helper through both
parsers. `@orpc/*` isn't a dependency or peer dependency of this package.

#### Differences from qs

oRPC's parser builds each key's value in the order the parameters appear. When a plain value
(`filter[age]=10`) is followed by a bracketed key on the same key (`filter[age][gt]=5`,
`filter[age][eq]=20`, `filter[age][]=20`), it discards the plain value before the schema sees it,
and `qs` keeps it. The request succeeds without that value, so a filter can match more than the client
asked for. Helpers can't recover the value. Clients should send one style per key: put the operator
first (`filter[age][gt]=5&filter[age]=10` works), write `filter[age][eq]=10` explicitly, or separate
values with commas (`filter[age]=10,20`). The same applies to `sort`, `include`, and `fields`
(`sort=age&sort[]=-age` keeps only `-age`).

Smaller differences, all with oRPC being stricter or unbounded:

- oRPC rejects prototype-like keys (`filter[__proto__][x]=1`, `filter[hasOwnProperty]=1`) with a 400
  from `.strict()`. `qs` with `allowPrototypes: false` drops them silently.
- oRPC rejects malformed bracket keys (`filter[age]]=10`) and an empty key (`=x`) with a 400. `qs`
  accepts the first and ignores the second.
- oRPC has no parameter limit. `qs` with `parameterLimit: 1000` silently drops parameters after the
  first 1,000. The helpers' own array limits still apply.

## Local development commands

See [`package.json`](./package.json) `scripts` for a list of commands.
