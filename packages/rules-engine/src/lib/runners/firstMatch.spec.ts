import { type Rule, type RuleContext } from "../..";
import { appendOutput } from "../appendOutput";
import { firstMatch } from "./firstMatch";

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
  runIf: () => false,
  run: (context) => appendOutput(context, 3),
};

describe("firstMatch", () => {
  describe("if", () => {
    it("returns true if any rules are true", () => {
      expect(firstMatch(testRule1, testRule2, testRule3).runIf(context.input)).toBe(true);
    });

    it("returns false if all rules are false", () => {
      expect(firstMatch(testRule3).runIf(context.input)).toBe(false);
    });
  });

  describe("run", () => {
    it("runs the first matching rule", () => {
      expect(firstMatch(testRule1, testRule2, testRule3).run(context)).toEqual({
        ...context,
        output: [2],
      });
    });

    it("returns the received context if no rule can be run", () => {
      expect(firstMatch(testRule1, testRule3).run(context)).toEqual(context);
    });
  });
});
