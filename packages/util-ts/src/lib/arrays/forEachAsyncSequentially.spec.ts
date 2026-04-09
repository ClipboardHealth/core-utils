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
    const callback = vi
      .fn<(item: number, index: number) => Promise<void>>()
      .mockImplementationOnce(async () => {})
      .mockRejectedValueOnce(new Error("Test error"));

    await expect(forEachAsyncSequentially(input, callback)).rejects.toThrow("Test error");
  });

  it("should stop processing after an error", async () => {
    const input = [1, 2, 3];
    const actual: number[] = [];
    const callback = vi
      .fn<(item: number, index: number) => Promise<void>>()
      .mockImplementationOnce(async (item) => {
        actual.push(item);
      })
      .mockRejectedValueOnce(new Error("Test error"));

    await expect(forEachAsyncSequentially(input, callback)).rejects.toThrow();

    expect(actual).toEqual([1]);
  });

  it("should be a noop when run on empty arrays", async () => {
    const callback = vi.fn<(item: number, index: number) => Promise<void>>();

    await forEachAsyncSequentially<number>([], callback);

    expect(callback).not.toHaveBeenCalled();
  });
});
