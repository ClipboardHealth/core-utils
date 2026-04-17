import { describe, expect, it } from "vitest";

import { queryFilterPreprocessor } from "./queryFilterPreprocessor";

describe(queryFilterPreprocessor, () => {
  it.each<{ expected: unknown; input: unknown; name: string }>([
    {
      name: "handles empty input",
      input: {},
      expected: {},
    },
    {
      name: "handles comma-separated string input",
      input: "10,20",
      expected: { eq: "10,20" },
    },
    {
      name: "handles single value input",
      input: "20",
      expected: { eq: "20" },
    },
    {
      name: "handles object with boolean value",
      input: { "20": true, gt: "10" },
      expected: { eq: "20", gt: "10" },
    },
    {
      name: "handles mixed array and object values from qs",
      input: [{ gt: "10" }, "20"],
      expected: { eq: "20", gt: "10" },
    },
    {
      name: "handles array input",
      input: ["10", "20"],
      expected: { eq: "10,20" },
    },
    {
      name: "handles nested array values from qs",
      input: [["10", "20"]],
      expected: { eq: "10,20" },
    },
    {
      name: "handles nested array with operator objects from qs",
      input: [[{ gt: "10" }, "20"]],
      expected: { eq: "20", gt: "10" },
    },
    {
      name: "handles numeric-keyed object with nested operator object",
      input: { "0": { gt: "10" }, "1": "20" },
      expected: { gt: "10", eq: "20" },
    },
    {
      name: "handles numeric-keyed object with nested array value",
      input: { "0": ["10", "20"], gt: "5" },
      expected: { eq: "10,20", gt: "5" },
    },
    {
      name: "handles complex object input",
      input: { "0": "10", "1": "20", gt: "5" },
      expected: { eq: "10,20", gt: "5" },
    },
    {
      name: "handles multiple filters",
      input: { gt: "10", lt: "20", ne: "15" },
      expected: { gt: "10", lt: "20", ne: "15" },
    },
    {
      name: "handles array values for filters",
      input: { lt: ["10", "20", "30"] },
      expected: { lt: "10,20,30" },
    },
    {
      name: "handles object with existing eq key",
      input: { eq: "10", gt: "5", "0": "20" },
      expected: { eq: "20,10", gt: "5" },
    },
  ])("$name", ({ input, expected }) => {
    expect(queryFilterPreprocessor(input)).toStrictEqual(expected);
  });
});
