import { type Rule, type RuleContext } from "../rule";

/**
 * Run the first rule that returns true for `runIf`.
 *
 * @param rules The rules to run.
 */
export function firstMatch<TInput, TOutput, TContext extends RuleContext<TInput, TOutput>>(
  ...rules: Array<Rule<TInput, TOutput, TContext>>
): Rule<TInput, TOutput, TContext> {
  return {
    runIf: (input, output) => rules.some((rule) => rule.runIf(input, output)),
    run: (context) => {
      const rule = rules.find((rule) => rule.runIf(context.input, context.output));
      return rule ? rule.run(context) : context;
    },
  };
}
