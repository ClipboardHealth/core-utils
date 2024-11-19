// packages/rules-engine/README.md
import {
  all,
  appendOutput,
  firstMatch,
  type Rule,
  type RuleContext,
} from "@clipboard-health/rules-engine";

interface Input {
  number1: number;
  number2: number;
}

interface Output {
  result: number;
}

const exampleContext: RuleContext<Input, Output> = {
  input: {
    number1: 2,
    number2: 5,
  },
  output: [],
};

const addNumbersIfPositiveRule: Rule<Input, Output> = {
  runIf: (input) => input.number1 > 0 && input.number2 > 0,
  run: (context) => {
    const { number1, number2 } = context.input;
    const sum = number1 + number2;
    return appendOutput(context, { result: sum });
  },
};

const multiplyNumbersIfPositiveRule: Rule<Input, Output> = {
  runIf: (input) => input.number1 > 0 && input.number2 > 0,
  run: (context) => {
    const { number1, number2 } = context.input;
    const sum = number1 * number2;
    return appendOutput(context, { result: sum });
  },
};

const divideNumbersIfNegative: Rule<Input, Output> = {
  runIf: (input) => input.number1 < 0 && input.number2 < 0,
  run: (context) => {
    const { number1, number2 } = context.input;
    const sum = number1 * number2;
    return appendOutput(context, { result: sum });
  },
};

// Using all() applies all the rules to the context
const allResult = all(
  addNumbersIfPositiveRule,
  divideNumbersIfNegative,
  multiplyNumbersIfPositiveRule,
).run(exampleContext);

console.log(allResult.output);
// => [{ result: 7 }, { result: 10 }]

// Using firstMatch() applies the first the rules to the context
const firstMatchResult = firstMatch(
  divideNumbersIfNegative,
  addNumbersIfPositiveRule,
  multiplyNumbersIfPositiveRule,
).run(exampleContext);

console.log(firstMatchResult.output);
// => [{ result: 7 }]
