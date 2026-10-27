import enforceContractInControllers from "./lib/rules/enforce-contract-in-controllers";
import enforceTsRestInControllers from "./lib/rules/enforce-ts-rest-in-controllers";
import noAmbiguousPositionalParameters from "./lib/rules/no-ambiguous-positional-parameters";
import noCrossContractImports from "./lib/rules/no-cross-contract-imports";
import noEmptyBooleanCall from "./lib/rules/no-empty-boolean-call";
import noParallelMongoSessionOps from "./lib/rules/no-parallel-mongo-session-ops";
import noTestsInContractPackages from "./lib/rules/no-tests-in-contract-packages";
import requireContractFixtureConstruction from "./lib/rules/require-contract-fixture-construction";
import requireContractResponseParse from "./lib/rules/require-contract-response-parse";
import requireHttpModuleFactory from "./lib/rules/require-http-module-factory";
import requireRunValidatorsWithUpsert from "./lib/rules/require-run-validators-with-upsert";
import requireZodImportInContracts from "./lib/rules/require-zod-import-in-contracts";

export const rules = {
  "enforce-contract-in-controllers": enforceContractInControllers,
  "enforce-ts-rest-in-controllers": enforceTsRestInControllers,
  "no-ambiguous-positional-parameters": noAmbiguousPositionalParameters,
  "no-empty-boolean-call": noEmptyBooleanCall,
  "no-cross-contract-imports": noCrossContractImports,
  "no-parallel-mongo-session-ops": noParallelMongoSessionOps,
  "no-tests-in-contract-packages": noTestsInContractPackages,
  "require-contract-fixture-construction": requireContractFixtureConstruction,
  "require-contract-response-parse": requireContractResponseParse,
  "require-http-module-factory": requireHttpModuleFactory,
  "require-run-validators-with-upsert": requireRunValidatorsWithUpsert,
  "require-zod-import-in-contracts": requireZodImportInContracts,
};
