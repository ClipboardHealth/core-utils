import { nullToUndefined } from "./nullToUndefined";

describe("nullToUndefined", () => {
  it("returns undefined", async () => {
    expect(await nullToUndefined(Promise.resolve(null))).toBeUndefined();
  });

  it("returns value", async () => {
    const expected = "hi";

    expect(await nullToUndefined(Promise.resolve(expected))).toBe(expected);
  });

  it("supports PromiseLike objects", async () => {
    const expected = "hello";

    const promiseLike: PromiseLike<string> = {
      // eslint-disable-next-line unicorn/no-thenable
      then: function <TResult1, TResult2>(
        onfulfilled?: (value: string) => TResult1 | PromiseLike<TResult1>,
      ): PromiseLike<TResult1 | TResult2> {
        if (onfulfilled) {
          return Promise.resolve(onfulfilled(expected));
        }

        return Promise.reject();
      },
    };

    expect(await nullToUndefined(promiseLike)).toBe(expected);
  });
});
