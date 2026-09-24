import { commaSeparatedList } from "../../index";

type Item = "a" | "b" | "c";

describe(commaSeparatedList, () => {
  const list = commaSeparatedList<Item>();

  it("preserves literals, order, and repeated members", () => {
    const single = list("a");
    const pair = list("b,c");
    const repeated = list("a,b,c,a");

    expectTypeOf(single).toEqualTypeOf<"a">();
    expectTypeOf(pair).toEqualTypeOf<"b,c">();
    expectTypeOf(repeated).toEqualTypeOf<"a,b,c,a">();
    expect([single, pair, repeated]).toEqual(["a", "b,c", "a,b,c,a"]);
  });

  it("preserves unions whose members are all valid lists", () => {
    function accept(input: "a" | "b,c") {
      const actual = list(input);

      expectTypeOf(actual).toEqualTypeOf<"a" | "b,c">();
      return actual;
    }

    expect(accept("b,c")).toBe("b,c");
  });

  it("rejects invalid lists at compile time without transforming runtime values", () => {
    const actual = [
      // @ts-expect-error: d is not an allowed item
      list("a,d"),
      // @ts-expect-error: trailing empty items are not allowed
      list("a,"),
      // @ts-expect-error: an empty list is not an allowed item
      list(""),
      // @ts-expect-error: whitespace is not normalized into an allowed item
      list("a, b"),
      // @ts-expect-error: leading empty items are not allowed
      list(",a"),
      // @ts-expect-error: interior empty items are not allowed
      list("a,,b"),
    ];

    expect(actual).toEqual(["a,d", "a,", "", "a, b", ",a", "a,,b"]);
  });

  it("rejects widened strings and unions containing an invalid list", () => {
    function accept(input: string, mixed: "a" | "a,d") {
      return [
        // @ts-expect-error: arbitrary strings have not been validated
        list(input),
        // @ts-expect-error: every member of the union must be a valid list
        list(mixed),
      ];
    }

    expect(accept("a", "a")).toEqual(["a", "a"]);
  });

  it("rejects empty segments even when the allowed type includes empty strings", () => {
    const allowEmpty = commaSeparatedList<"" | "a">();

    const actual = [
      // @ts-expect-error: a list must contain a nonempty item
      allowEmpty(""),
      // @ts-expect-error: interior empty segments are invalid
      allowEmpty("a,,a"),
    ];

    expect(actual).toEqual(["", "a,,a"]);
  });

  it("requires an explicit allowed literal union", () => {
    const allowAny = commaSeparatedList<string>();

    function accept(input: `${string},a`) {
      // @ts-expect-error: unrestricted string does not constrain the allowed items
      return allowAny(input);
    }

    // @ts-expect-error: the allowed item union must be supplied
    const omitted = commaSeparatedList()("a");

    expect(accept(",a")).toBe(",a");
    expect(omitted).toBe("a");
  });
});
