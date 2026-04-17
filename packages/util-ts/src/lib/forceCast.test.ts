import { describe, expect, it } from "vitest";

import { forceCast } from "./forceCast";

describe(forceCast, () => {
  it("doesn't actually change type", () => {
    const a: number = forceCast<number>("a");
    // oxlint-disable-next-line vitest/prefer-expect-type-of
    expect(typeof a).toBe("string");
  });
});
