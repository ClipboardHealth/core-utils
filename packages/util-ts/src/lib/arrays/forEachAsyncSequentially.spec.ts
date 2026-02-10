import { forEachAsyncSequentially } from "./forEachAsyncSequentially";

describe("forEachAsyncSequentially", () => {
  it("should pass the current executing index in the list to the async task", async () => {
    const input = ["a", "b", "c"];
    const results: Array<{ item: string; index: number }> = [];

    await forEachAsyncSequentially(input, async (item, index) => {
      await Promise.resolve();
      results.push({ item, index });
    });

    expect(results).toEqual([
      { item: "a", index: 0 },
      { item: "b", index: 1 },
      { item: "c", index: 2 },
    ]);
  });

  it("should ensure each async task runs sequentially", async () => {
    const input = [10, 5, 1];
    const actual: number[] = [];

    await forEachAsyncSequentially(input, async (item) => {
      await new Promise((resolve) => {
        setTimeout(resolve, item);
      });
      actual.push(item);
    });

    expect(actual).toEqual([10, 5, 1]);
  });

  it("should propagates errors from the async task", async () => {
    const input = [1, 2, 3];

    await expect(
      forEachAsyncSequentially(input, async (item) => {
        // eslint-disable-next-line jest/no-conditional-in-test
        if (item === 2) {
          throw new Error("Test error");
        }
      }),
    ).rejects.toThrow("Test error");
  });

  it("should stop processing after an error", async () => {
    const input = [1, 2, 3];
    const actual: number[] = [];

    await expect(
      forEachAsyncSequentially(input, async (item) => {
        // eslint-disable-next-line jest/no-conditional-in-test
        if (item === 2) {
          throw new Error("Test error");
        }
        actual.push(item);
      }),
    ).rejects.toThrow();

    expect(actual).toEqual([1]);
  });

  it("should be a noop when run on empty arrays", async () => {
    const callback = jest.fn();

    await forEachAsyncSequentially([], callback);

    expect(callback).not.toHaveBeenCalled();
  });
});
