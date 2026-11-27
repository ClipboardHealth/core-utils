import path from "node:path";

import { measureFiles } from "./measure";

const WORKSPACE_ROOT = path.resolve(__dirname, "../../../../../..");

// 15 lines, over the configured `max-lines` of 12 but within Oxlint's default of 300.
const FILE = {
  content: Array.from({ length: 15 }, (_, index) => `export const v${index} = ${index};\n`).join(
    "",
  ),
  path: "src/big.ts",
};

describe("measureFiles", () => {
  it.each([
    { printedOptions: { max: 12 }, shape: "an options object, as Oxlint 1.94 on prints it" },
    { printedOptions: [{ max: 12 }], shape: "an options array, as Oxlint before 1.94 prints it" },
  ])(
    "measures against the configured max when printed options are $shape",
    ({ printedOptions }) => {
      const measurements = measureFiles({
        files: [FILE],
        oxlintFrom: WORKSPACE_ROOT,
        printedConfig: { rules: { "max-lines": ["deny", printedOptions] } },
        ruleNames: ["max-lines"],
      });

      expect(measurements.get("src/big.ts")?.get("max-lines")).toStrictEqual({
        excess: 15,
        max: 15,
      });
    },
  );
});
