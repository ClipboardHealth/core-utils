import enforceTsRestInControllers from "./lib/rules/enforce-ts-rest-in-controllers";
import noCrossContractImports from "./lib/rules/no-cross-contract-imports";
import requireHttpModuleFactory from "./lib/rules/require-http-module-factory";
import requireRunValidatorsWithUpsert from "./lib/rules/require-run-validators-with-upsert";
import requireZodImportInContracts from "./lib/rules/require-zod-import-in-contracts";

export const rules = {
  "enforce-ts-rest-in-controllers": enforceTsRestInControllers,
  "no-cross-contract-imports": noCrossContractImports,
  "require-http-module-factory": requireHttpModuleFactory,
  "require-run-validators-with-upsert": requireRunValidatorsWithUpsert,
  "require-zod-import-in-contracts": requireZodImportInContracts,
};
