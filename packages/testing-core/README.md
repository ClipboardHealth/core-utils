# @clipboard-health/testing-core <!-- omit from toc -->

TypeScript-friendly testing utilities.

## Table of contents <!-- omit from toc -->

- [Install](#install)
- [Usage](#usage)
  - [Contract fixtures](#contract-fixtures)
  - [Type narrowing `expect` helpers](#type-narrowing-expect-helpers)
- [Local development commands](#local-development-commands)

## Install

```bash
npm install @clipboard-health/testing-core
```

## Usage

### Contract fixtures

Parse API response fixtures through their producer-owned Zod contract so drift fails when the
fixture is constructed. Use `buildContractFixture` for one-off fixtures:

```ts
import { FeatureResponseSchema } from "@clipboard-health/contract-feature";
import { buildContractFixture } from "@clipboard-health/testing-core";

export const mockFeature = buildContractFixture({
  schema: FeatureResponseSchema,
  fixture: { id: "feature-id" },
});
```

Use `createContractFixtureBuilder` for fixture families with shallow overrides:

```ts
import { createContractFixtureBuilder } from "@clipboard-health/testing-core";

const buildFeature = createContractFixtureBuilder({
  schema: FeatureResponseSchema,
  defaults: { id: "default-id", name: "Default" },
});

export const mockRenamedFeature = buildFeature({ name: "Renamed" });
```

Both helpers accept schema input and return schema output, including Zod transforms.

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

<embedex source="packages/testing-core/examples/expectToBeDefined.ts">

```ts
import { strictEqual } from "node:assert/strict";

import { expectToBeDefined } from "@clipboard-health/testing-core";

function getValue(): string | undefined {
  return "hi";
}

const value = getValue();
expectToBeDefined(value);

// Narrowed to `string`
const { length } = value;
strictEqual(length, 2);
```

</embedex>

<embedex source="packages/testing-core/examples/expectToBeLeft.ts">

```ts
import { strictEqual } from "node:assert/strict";

import { expectToBeLeft } from "@clipboard-health/testing-core";
import { either as E } from "@clipboard-health/util-ts";

function divide(numerator: number, denominator: number): E.Either<string, number> {
  if (denominator === 0) {
    return E.left("Cannot divide by zero");
  }

  return E.right(numerator / denominator);
}

const value = divide(10, 0);
expectToBeLeft(value);

// Narrowed to Left
strictEqual(value.left, "Cannot divide by zero");
```

</embedex>

<embedex source="packages/testing-core/examples/expectToBeRight.ts">

```ts
import { strictEqual } from "node:assert/strict";

import { expectToBeRight } from "@clipboard-health/testing-core";
import { either as E } from "@clipboard-health/util-ts";

function divide(numerator: number, denominator: number): E.Either<string, number> {
  if (denominator === 0) {
    return E.left("Cannot divide by zero");
  }

  return E.right(numerator / denominator);
}

const value = divide(10, 2);
expectToBeRight(value);

// Narrowed to Right
strictEqual(value.right, 5);
```

</embedex>

<embedex source="packages/testing-core/examples/expectToBeFailure.ts">

```ts
import { strictEqual } from "node:assert/strict";

import { expectToBeFailure } from "@clipboard-health/testing-core";
import { failure, type ServiceResult, success } from "@clipboard-health/util-ts";

function validateAge(age: number): ServiceResult<number> {
  if (age < 0) {
    return failure({ issues: [{ code: "INVALID_AGE", message: "Age cannot be negative" }] });
  }

  return success(age);
}

const result = validateAge(-5);
expectToBeFailure(result);

// Narrowed to Left (Failure)
strictEqual(result.left.issues[0]?.message, "Age cannot be negative");
```

</embedex>

<embedex source="packages/testing-core/examples/expectToBeSuccess.ts">

```ts
import { strictEqual } from "node:assert/strict";

import { expectToBeSuccess } from "@clipboard-health/testing-core";
import { failure, type ServiceResult, success } from "@clipboard-health/util-ts";

function validateAge(age: number): ServiceResult<number> {
  if (age < 0) {
    return failure({ issues: [{ code: "INVALID_AGE", message: "Age cannot be negative" }] });
  }

  return success(age);
}

const result = validateAge(25);
expectToBeSuccess(result);

// Narrowed to Right (Success)
strictEqual(result.right, 25);
```

</embedex>

<embedex source="packages/testing-core/examples/expectToBeSafeParseError.ts">

```ts
import { strictEqual } from "node:assert/strict";

import { expectToBeDefined, expectToBeSafeParseError } from "@clipboard-health/testing-core";
import { z } from "zod";

const schema = z.object({ name: z.string() });

const value = schema.safeParse({ name: 1 });
expectToBeSafeParseError(value);

// Narrowed to `SafeParseError`
const [firstIssue] = value.error.issues;
expectToBeDefined(firstIssue);

// Narrowed to `ZodIssue`
strictEqual(firstIssue.message, "Expected string, received number");
```

</embedex>

<embedex source="packages/testing-core/examples/expectToBeSafeParseSuccess.ts">

```ts
import { strictEqual } from "node:assert/strict";

import { expectToBeSafeParseSuccess } from "@clipboard-health/testing-core";
import { z } from "zod";

const schema = z.object({ name: z.string() });

const value = schema.safeParse({ name: "hi" });
expectToBeSafeParseSuccess(value);

// Narrowed to `SafeParseSuccess`
strictEqual(value.data.name, "hi");
```

</embedex>

## Local development commands

See [`package.json`](./package.json) `scripts` for a list of commands.
