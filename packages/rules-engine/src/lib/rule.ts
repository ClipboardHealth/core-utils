import { type ReadonlyDeep } from "type-fest";

export interface RuleContext<TInput, TOutput> {
  /**
   * Input is immutable, rules must not modify it.
   */
  input: ReadonlyDeep<TInput>;

  /**
   * Output is immutable, do not modify existing items, only append using {@link appendOutput}.
   */
  output: ReadonlyArray<ReadonlyDeep<TOutput>>;
}

export interface Rule<
  TInput,
  TOutput,
  TContext extends RuleContext<TInput, TOutput> = RuleContext<TInput, TOutput>,
> {
  /**
   * Returns whether the rule should run or not.
   *
   * The `output` is passed as an optional second parameter for advanced use cases, but relying on
   * it should be avoided since it may be appended to by previous rules by the time `run` is called.
   */
  runIf: (input: ReadonlyDeep<TInput>, output?: ReadonlyArray<ReadonlyDeep<TOutput>>) => boolean;

  /**
   * A pure function that runs rule logic and returns a new context by appending to the output
   * array.
   *
   * @see {@link appendOutput}
   */
  run: (context: TContext) => TContext;
}
