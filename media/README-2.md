# @clipboard-health/example-nestjs <!-- omit from toc -->

A NestJS application using our libraries, primarily for end-to-end testing.

## Table of contents <!-- omit from toc -->

- [Usage](#usage)
  - [Send requests](#send-requests)
  - [`ts-rest` client](#ts-rest-client)
- [Local development commands](#local-development-commands)

## Usage

```bash
# Start NestJS application
npx nx serve example-nestjs
```

### Send requests

Install the [REST Client](https://marketplace.visualstudio.com/items?itemName=humao.rest-client) VSCode extension and open [`requests.http`](./requests.http) to send requests.

### `ts-rest` client

The following makes requests to the example application using the `ts-rest` client.

<!-- prettier-ignore -->
```ts
// ./examples/client.ts

import { initClient, type ServerInferRequest } from "@ts-rest/core";

import { contract } from "../src/contract";

type ListUsersRequest = ServerInferRequest<typeof contract.list>;

const port = process.env["PORT"] ?? 3000;
export const client = initClient(contract, {
  baseUrl: `http://localhost:${port}`,
});

async function main() {
  const query: ListUsersRequest["query"] = {
    page: {
      cursor: "eyJpZCI6IjQ2MDJCNjI5LTg3N0QtNEVCNC1CQzhELTREM0NGNzkzQkM2NSJ9",
      size: 10,
    },
    fields: {
      user: ["age", "dateOfBirth"],
    },
    filter: {
      age: {
        gt: [2],
      },
      dateOfBirth: {
        gte: [new Date("2016-01-01")],
      },
      isActive: {
        eq: ["true"],
      },
    },
  };

  try {
    const { status, body } = await client.list({ query });
    console.debug(status, JSON.stringify(body, undefined, 2));
  } catch (error) {
    console.error("Error occurred:", error);
  }
}

// eslint-disable-next-line unicorn/prefer-top-level-await
void main();

```

## Local development commands

See [`package.json`](./package.json) `scripts` for a list of commands.
