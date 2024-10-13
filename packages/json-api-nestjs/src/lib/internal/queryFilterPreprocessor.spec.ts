import { queryFilterPreprocessor } from "./queryFilterPreprocessor";

describe("queryFilterPreprocessor", () => {
  it("handles comma-separated string input", () => {
    const input = "10,20";

    const actual = queryFilterPreprocessor(input);

    expect(actual).toEqual({ eq: "10,20" });
  });

  it("handles single value input", () => {
    const input = "20";

    const actual = queryFilterPreprocessor(input);

    expect(actual).toEqual({ eq: "20" });
  });

  it("handles object with boolean value", () => {
    const input = { "20": true, gt: "10" };

    const actual = queryFilterPreprocessor(input);

    expect(actual).toEqual({ eq: "20", gt: "10" });
  });

  it("handles array input", () => {
    const input = ["10", "20"];

    const actual = queryFilterPreprocessor(input);

    expect(actual).toEqual({ eq: "10,20" });
  });

  it("handles complex object input", () => {
    const input = { "0": "10", "1": "20", gt: "5" };

    const actual = queryFilterPreprocessor(input);

    expect(actual).toEqual({ eq: "10,20", gt: "5" });
  });

  it("handles multiple filters", () => {
    const input = { gt: "10", lt: "20", ne: "15" };

    const actual = queryFilterPreprocessor(input);

    expect(actual).toEqual({ gt: "10", lt: "20", ne: "15" });
  });

  it("handles array values for filters", () => {
    const input = { lt: ["10", "20", "30"] };

    const actual = queryFilterPreprocessor(input);

    expect(actual).toEqual({ lt: "10,20,30" });
  });

  it("handles empty input", () => {
    const input = {};

    const actual = queryFilterPreprocessor(input);

    expect(actual).toEqual({});
  });

  it("handles object with existing eq key", () => {
    const input = { eq: "10", gt: "5", "0": "20" };

    const actual = queryFilterPreprocessor(input);

    expect(actual).toEqual({ eq: "20,10", gt: "5" });
  });
});
