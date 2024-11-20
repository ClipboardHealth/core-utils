// packages/rules-engine/README.md
import { deepEqual } from "node:assert/strict";

import {
  all,
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
