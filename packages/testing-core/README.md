# @clipboard-health/testing-core <!-- omit from toc -->

TypeScript-friendly testing utilities.

## Table of contents <!-- omit from toc -->

- [Install](#install)
- [Usage](#usage)
  - [Type narrowing `expect` helpers](#type-narrowing-expect-helpers)
- [Local development commands](#local-development-commands)

## Install

```bash
npm install @clipboard-health/testing-core
```

## Usage

### Type narrowing `expect` helpers

Jest's [`expect(...).toBeDefined()`](https://jestjs.io/docs/expect#tobedefined) does not narrow types.

This gives a type error:

```ts
const value = getValue(); // returns 'string | undefined'

expect(value).toBeDefined();

const { length } = value;
// ^? Property 'length' does not exist on type 'string | undefined'.
```

This library's helpers narrow types:

<!-- prettier-ignore -->
```ts
// ./examples/expectToBeDefined.ts

import { ok } from "node:assert/strict";

import { expectToBeDefined } from "@clipboard-health/testing-core";

function getValue(): string | undefined {
  return "hi";
}

const value = getValue();
expectToBeDefined(value);

// Narrowed to `string`
const { length } = value;
ok(length === 2);

```

<!-- prettier-ignore -->
```ts
// ./examples/expectToBeSafeParseError.ts

import { ok } from "node:assert/strict";

import { expectToBeDefined, expectToBeSafeParseError } from "@clipboard-health/testing-core";
import { z } from "zod";

const schema = z.object({ name: z.string() });

const value = schema.safeParse({ name: 1 });
expectToBeSafeParseError(value);

// Narrowed to `SafeParseError`
const firstIssue = value.error.issues[0];
expectToBeDefined(firstIssue);

// Narrowed to `ZodIssue`
ok(firstIssue.message === "Expected string, received number");

```

<!-- prettier-ignore -->
```ts
// ./examples/expectToBeSafeParseSuccess.ts

import { ok } from "node:assert/strict";

import { expectToBeSafeParseSuccess } from "@clipboard-health/testing-core";
import { z } from "zod";

const schema = z.object({ name: z.string() });

const value = schema.safeParse({ name: "hi" });
expectToBeSafeParseSuccess(value);

// Narrowed to `SafeParseSuccess`
ok(value.data.name === "hi");

```

## Local development commands

See [`package.json`](./package.json) `scripts` for a list of commands.
