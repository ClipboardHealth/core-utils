# @clipboard-health/rules-engine <!-- omit from toc -->

A pure functional rules engine to keep logic-dense code simple, reliable, understandable, and explainable.

The engine uses static rules created in code instead of dynamic rules serialized to a database since we haven't needed the latter yet.

## Table of contents <!-- omit from toc -->

- [Install](#install)
- [Usage](#usage)
- [Local development commands](#local-development-commands)

## Install

```bash
npm install @clipboard-health/rules-engine
```

## Usage

<embedex source="packages/rules-engine/examples/rules.ts">

```ts
import { deepEqual } from "node:assert/strict";

import {
  all,
  allIf,
  appendOutput,
  firstMatch,
  type Rule,
  type RuleContext,
} from "@clipboard-health/rules-engine";

interface Input {
  a: number;
  b: number;
}

interface Output {
  result: number;
}

const exampleContext: RuleContext<Input, Output> = {
  input: {
    a: 2,
    b: 5,
  },
  output: [],
};

const addNumbersIfPositiveRule: Rule<Input, Output> = {
  runIf: (input) => input.a > 0 && input.b > 0,
  run: (context) => {
    const { a, b } = context.input;
    return appendOutput(context, { result: a + b });
  },
};

const multiplyNumbersIfPositiveRule: Rule<Input, Output> = {
  runIf: (input) => input.a > 0 && input.b > 0,
  run: (context) => {
    const { a, b } = context.input;
    return appendOutput(context, { result: a * b });
  },
};

const divideNumbersIfNegative: Rule<Input, Output> = {
  runIf: (input) => input.a < 0 && input.b < 0,
  run: (context) => {
    const { a, b } = context.input;
    return appendOutput(context, { result: a / b });
  },
};

// Using all() applies all the rules to the context
const allResult = all(
  addNumbersIfPositiveRule,
  divideNumbersIfNegative,
  multiplyNumbersIfPositiveRule,
).run(exampleContext);

deepEqual(allResult.output, [{ result: 7 }, { result: 10 }]);

// Using firstMatch() applies the first the rules to the context
const firstMatchResult = firstMatch(
  divideNumbersIfNegative,
  addNumbersIfPositiveRule,
  multiplyNumbersIfPositiveRule,
).run(exampleContext);

deepEqual(firstMatchResult.output, [{ result: 7 }]);

// Using allIf() applies all the rules that return true for `runIf` to the context when the predicate
// (a function received as firs argument) returns true
const allIfResult = allIf(
  (input) => input.a === 2,
  divideNumbersIfNegative,
  addNumbersIfPositiveRule,
  multiplyNumbersIfPositiveRule,
).run(exampleContext);

deepEqual(allIfResult.output, [{ result: 7 }, { result: 10 }]);
```

</embedex>

## Local development commands

See [`package.json`](./package.json) `scripts` for a list of commands.
