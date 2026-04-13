import { nullToUndefined } from "./nullToUndefined";

describe(nullToUndefined, () => {
  it("returns undefined", async () => {
    await expect(nullToUndefined(Promise.resolve(null))).resolves.toBeUndefined();
  });

  it("returns value", async () => {
    const expected = "hi";

    await expect(nullToUndefined(Promise.resolve(expected))).resolves.toBe(expected);
  });

  it("supports PromiseLike objects", async () => {
    const expected = "hello";

    const promiseLike: PromiseLike<string> = {
      // eslint-disable-next-line unicorn/no-thenable
      then: function <TResult1, TResult2>(
        onfulfilled?: (value: string) => TResult1 | PromiseLike<TResult1>,
      ): PromiseLike<TResult1 | TResult2> {
        // eslint-disable-next-line jest/no-conditional-in-test
        if (onfulfilled) {
          return Promise.resolve(onfulfilled(expected));
        }

        return Promise.reject(new Error("No onfulfilled handler"));
      },
    };

    await expect(nullToUndefined(promiseLike)).resolves.toBe(expected);
  });
});
