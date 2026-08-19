import { rules } from "./index";

describe("oxlint plugin", () => {
  it("exports every Clipboard lint rule", () => {
    expect(Object.keys(rules)).toStrictEqual([
      "enforce-ts-rest-in-controllers",
      "no-empty-boolean-call",
      "no-cross-contract-imports",
      "require-contract-fixture-construction",
      "require-contract-response-parse",
      "require-http-module-factory",
      "require-run-validators-with-upsert",
      "require-zod-import-in-contracts",
    ]);
  });
});
