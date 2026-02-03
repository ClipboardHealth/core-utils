import enforceTsRestInControllers from "./lib/rules/enforce-ts-rest-in-controllers";
import preferArrayMethods from "./lib/rules/prefer-array-methods";
import requireHttpModuleFactory from "./lib/rules/require-http-module-factory";
import requireRunValidatorsWithUpsert from "./lib/rules/require-run-validators-with-upsert";

export const rules = {
  "enforce-ts-rest-in-controllers": enforceTsRestInControllers,
  "prefer-array-methods": preferArrayMethods,
  "require-http-module-factory": requireHttpModuleFactory,
  "require-run-validators-with-upsert": requireRunValidatorsWithUpsert,
};
