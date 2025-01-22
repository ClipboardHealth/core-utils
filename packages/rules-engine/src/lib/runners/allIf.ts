import { type Rule, type RuleContext } from "../rule";

/**
 * Run all rules that return true when `allIfPredicate` returns true.
 *
 * @param rules The rules to run.
 */
export function allIf<TInput, TOutput, TContext extends RuleContext<TInput, TOutput>>(
  allIfPredicate: (input: RuleContext<TInput, TOutput>["input"]) => boolean,
  ...rules: Array<Rule<TInput, TOutput, TContext>>
): Rule<TInput, TOutput, TContext> {
  return {
    runIf: (input) => allIfPredicate(input),
    run: (context: TContext) =>
      rules
        .filter((rule) => rule.runIf(context.input))
        .reduce((previousContext, rule) => rule.run(previousContext), context),
  };
}
