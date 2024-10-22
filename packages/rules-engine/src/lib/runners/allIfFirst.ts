import { type Rule, type RuleContext } from "../rule";

/**
 * Run all rules that return true for `runIf` only if the first rule returns true.
 *
 * @param rules The rules to run.
 */
export function allIfFirst<TInput, TOutput, TContext extends RuleContext<TInput, TOutput>>(
  ...rules: Array<Rule<TInput, TOutput, TContext>>
): Rule<TInput, TOutput, TContext> {
  return {
    runIf: (input) => Boolean(rules[0]?.runIf(input)),
    run: (context) =>
      rules
        .filter((rule) => rule.runIf(context.input))
        .reduce((previousContext, rule) => rule.run(previousContext), context),
  };
}
