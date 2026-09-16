import enforceTsRestInControllers from "./lib/rules/enforce-ts-rest-in-controllers";
import noCrossContractImports from "./lib/rules/no-cross-contract-imports";
import noEmptyBooleanCall from "./lib/rules/no-empty-boolean-call";
import noParallelMongoSessionOps from "./lib/rules/no-parallel-mongo-session-ops";
import preferIsDefined from "./lib/rules/prefer-is-defined";
import preferIsNil from "./lib/rules/prefer-is-nil";
import requireContractFixtureConstruction from "./lib/rules/require-contract-fixture-construction";
import requireContractResponseParse from "./lib/rules/require-contract-response-parse";
import requireHttpModuleFactory from "./lib/rules/require-http-module-factory";
import requireRunValidatorsWithUpsert from "./lib/rules/require-run-validators-with-upsert";
import requireZodImportInContracts from "./lib/rules/require-zod-import-in-contracts";

export const rules = {
  "enforce-ts-rest-in-controllers": enforceTsRestInControllers,
  "no-empty-boolean-call": noEmptyBooleanCall,
  "no-cross-contract-imports": noCrossContractImports,
  "no-parallel-mongo-session-ops": noParallelMongoSessionOps,
  "prefer-is-defined": preferIsDefined,
  "prefer-is-nil": preferIsNil,
  "require-contract-fixture-construction": requireContractFixtureConstruction,
  "require-contract-response-parse": requireContractResponseParse,
  "require-http-module-factory": requireHttpModuleFactory,
  "require-run-validators-with-upsert": requireRunValidatorsWithUpsert,
  "require-zod-import-in-contracts": requireZodImportInContracts,
};
