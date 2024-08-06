import { type ReadonlyDeep } from "type-fest";

export interface RuleContext<TInput, TOutput> {
  /**
   * Input is immutable, rules must not modify it.
   */
  input: ReadonlyDeep<TInput>;

  /**
   * Output is immutable, do not modify existing items, only append.
   *
   * @see {@link appendOutput}
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
   * Only the `input` and not the full `context` is passed to `runIf`. This prevents rules from
   * relying on `output`, which may be appended to by previous rules by the time `run` is called.
   */
  runIf: (input: ReadonlyDeep<TInput>) => boolean;

  /**
   * A pure function that runs rule logic and returns a new context by appending to the output
   * array.
   *
   * @see {@link appendOutput}
   */
  run: (context: TContext) => TContext;
}
