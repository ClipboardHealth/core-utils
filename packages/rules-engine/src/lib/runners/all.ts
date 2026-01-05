import { type Rule, type RuleContext } from "../rule";

/**
 * Run all rules that return true for `runIf`.
 *
 * @param rules The rules to run.
 */
export function all<TInput, TOutput, TContext extends RuleContext<TInput, TOutput>>(
  ...rules: Array<Rule<TInput, TOutput, TContext>>
): Rule<TInput, TOutput, TContext> {
  return {
    runIf: (input, output) => rules.some((rule) => rule.runIf(input, output)),
    run: (context) =>
      rules
        .filter((rule) => rule.runIf(context.input, context.output))
        .reduce((previousContext, rule) => rule.run(previousContext), context),
  };
}
