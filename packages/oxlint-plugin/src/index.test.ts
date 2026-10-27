import { rules } from "./index";

describe("oxlint plugin", () => {
  it("exports every Clipboard lint rule", () => {
    expect(Object.keys(rules)).toStrictEqual([
      "enforce-contract-in-controllers",
      "enforce-ts-rest-in-controllers",
      "no-ambiguous-positional-parameters",
      "no-empty-boolean-call",
      "no-cross-contract-imports",
      "no-parallel-mongo-session-ops",
      "no-tests-in-contract-packages",
      "require-contract-fixture-construction",
      "require-contract-response-parse",
      "require-http-module-factory",
      "require-run-validators-with-upsert",
      "require-zod-import-in-contracts",
    ]);
  });
});
