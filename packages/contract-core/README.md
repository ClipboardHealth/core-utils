# @clipboard-health/contract-core <!-- omit from toc -->

Shared Zod schemas for Clipboard Health's contracts.

## Table of contents <!-- omit from toc -->

- [Install](#install)
- [Usage](#usage)
  - [Zod schemas](#zod-schemas)
- [Local development commands](#local-development-commands)

## Install

```bash
npm install @clipboard-health/contract-core
```

## Usage

### Zod schemas

<!-- prettier-ignore -->
```ts
// ./examples/schemas.ts

import { apiErrors, booleanString, nonEmptyString, uuid } from "@clipboard-health/contract-core";

apiErrors.parse({
  errors: [
    {
      code: "NotFound",
      detail: "Resource 'b146a790-9ed1-499f-966d-6c4905dc667f' not found",
      id: "6191a8a0-96ff-4d4b-8e0f-746a5ab215f9",
      status: "404",
      title: "Not Found",
    },
  ],
});

booleanString.parse("true");

nonEmptyString.parse("hello");

uuid.parse("b8d617bb-edef-4262-a6e3-6cc807fa1b26");

```

## Local development commands

See [`package.json`](./package.json) `scripts` for a list of commands.
