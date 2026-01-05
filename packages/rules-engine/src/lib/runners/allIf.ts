import { type Rule, type RuleContext } from "../rule";

/**
 * Run all rules that return true for their runIf condition, but only when the predicate function returns true.
 *
 * @param allIfPredicate - Function that determines if rules should be evaluated
 * @param rules - Array of rules to evaluate when predicate is true
 * @returns A Rule that combines the behavior of all matching rules
 *
 * @example
 * const rule = allIf(
 *   (input) => input.type === 'special',
 *   rule1,
 *   rule2
 * );
 */
export function allIf<TInput, TOutput, TContext extends RuleContext<TInput, TOutput>>(
  allIfPredicate: (
    input: RuleContext<TInput, TOutput>["input"],
    output?: RuleContext<TInput, TOutput>["output"],
  ) => boolean,
  ...rules: Array<Rule<TInput, TOutput, TContext>>
): Rule<TInput, TOutput, TContext> {
  return {
    runIf: (input, output) => allIfPredicate(input, output),
    run: (context: TContext) =>
      rules
        .filter((rule) => rule.runIf(context.input, context.output))
        .reduce((previousContext, rule) => rule.run(previousContext), context),
  };
}
