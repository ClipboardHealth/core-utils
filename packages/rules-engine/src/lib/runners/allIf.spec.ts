import { appendOutput } from "../appendOutput";
import { type Rule, type RuleContext } from "../rule";
import { allIf } from "./allIf";

interface Input {
  a: number;
  b: number;
}

type Output = number;

type TestContext = RuleContext<Input, Output>;

type TestRule = Rule<Input, Output>;

const context: TestContext = {
  input: { a: 1, b: 2 },
  output: [],
};

const testRule1: TestRule = {
  runIf: () => false,
  run: (context) => appendOutput(context, 1),
};

const testRule2: TestRule = {
  runIf: () => true,
  run: (context) => appendOutput(context, 2),
};

const testRule3: TestRule = {
  runIf: () => true,
  run: (context) => appendOutput(context, 3),
};

const testRule4: TestRule = {
  runIf: () => false,
  run: (context) => appendOutput(context, 4),
};

describe("allIf", () => {
  describe("if", () => {
    it("returns true if predicate returns true", () => {
      expect(allIf(() => true, testRule2, testRule1).runIf(context.input)).toBe(true);
    });

    it("returns false if predicate returns false", () => {
      expect(allIf(() => false, testRule2, testRule1).runIf(context.input)).toBe(false);
    });
  });

  describe("run", () => {
    it("runs all the matching rules", () => {
      expect(allIf(() => true, testRule2, testRule1, testRule3, testRule4).run(context)).toEqual({
        ...context,
        output: [2, 3],
      });
    });

    it("returns the received context if no rule can be run", () => {
      expect(allIf(() => true, testRule1, testRule4).run(context)).toEqual(context);
    });
  });
});
