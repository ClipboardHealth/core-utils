# @clipboard-health/json-api

Utilities for adhering to the [JSON:API](https://jsonapi.org/) specification.

## Table of Contents

- [Install](#install)
- [Usage](#usage)
- [Local development commands](#local-development-commands)

## Install

```bash
npm install @clipboard-health/json-api
```

## Usage

### Query helpers

From the client, call `toSearchParams` to convert from `ClientJsonApiQuery` to `URLSearchParams`:

<!-- prettier-ignore -->
```ts
// ./examples/toSearchParams.ts

import { deepEqual } from "node:assert/strict";

import { toSearchParams } from "@clipboard-health/json-api";

import { type ClientJsonApiQuery } from "../src/lib/types";

const isoDate = "2024-01-01T15:00:00.000Z";
const query: ClientJsonApiQuery = {
  fields: { dog: ["age"] },
  filter: { age: [2], createdAt: { gte: new Date(isoDate) }, isGoodDog: true },
  include: ["owner"],
  page: { size: 10 },
  sort: ["-age"],
};

deepEqual(
  toSearchParams(query).toString(),
  new URLSearchParams(
    "fields[dog]=age&filter[age]=2&filter[createdAt][gte]=2024-01-01T15:00:00.000Z&filter[isGoodDog]=true&include=owner&page[size]=10&sort=-age",
  ).toString(),
);

```

From the server, call `toJsonApiQuery` to convert from `URLSearchParams` to `ServerJsonApiQuery`:

<!-- prettier-ignore -->
```ts
// ./examples/toJsonApiQuery.ts

import { deepEqual } from "node:assert/strict";

import { type ServerJsonApiQuery, toJsonApiQuery } from "@clipboard-health/json-api";

const isoDate = "2024-01-01T15:00:00.000Z";
// The URLSearchParams constructor also supports URL-encoded strings
const searchParams = new URLSearchParams(
  `fields[dog]=age&filter[age]=2&filter[createdAt][gte]=${isoDate}&filter[isGoodDog]=true&include=owner&page[size]=10&sort=-age`,
);

const query: ServerJsonApiQuery = toJsonApiQuery(searchParams);

deepEqual(query, {
  fields: { dog: ["age"] },
  filter: { age: ["2"], createdAt: { gte: isoDate }, isGoodDog: ["true"] },
  include: ["owner"],
  page: {
    size: "10",
  },
  sort: ["-age"],
});

```

## Local development commands

See [`package.json`](./package.json) `scripts` for a list of commands.
