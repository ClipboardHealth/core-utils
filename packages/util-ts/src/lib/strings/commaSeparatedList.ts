/**
 * Checks comma-separated string literals against an explicit allowed literal union at compile time.
 * Returns the input unchanged, without runtime validation or whitespace normalization.
 */
export function commaSeparatedList<Allowed extends string>() {
  return function <const Value extends string>(
    value: Value & ([IsValidList<Value, Allowed>] extends [true] ? unknown : never),
  ): Value {
    return value;
  };
}

type IsValidList<Value extends string, Allowed extends string> = string extends Allowed | Value
  ? false
  : Value extends ""
    ? false
    : Value extends `${infer Head},${infer Tail}`
      ? Head extends ""
        ? false
        : Head extends Allowed
          ? IsValidList<Tail, Allowed>
          : false
      : Value extends Allowed
        ? true
        : false;
