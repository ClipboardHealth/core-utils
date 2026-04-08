import { type ReadonlyDeep } from "type-fest";

import { type RuleContext } from "./rule";

/**
 * Rule output is immutable, do not modify existing items, only append using this function.
 */
export function appendOutput<TInput, TOutput>(
  context: RuleContext<TInput, TOutput>,
  output: ReadonlyDeep<TOutput>,
): RuleContext<TInput, TOutput> {
  return {
    input: context.input,
    output: [...context.output, output],
  };
}
