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
      rules.reduce(
        (previousContext, rule) =>
          rule.runIf(previousContext.input, previousContext.output)
            ? rule.run(previousContext)
            : previousContext,
        context,
      ),
  };
}
