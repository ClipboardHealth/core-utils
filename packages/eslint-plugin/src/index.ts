import enforceTsRestInControllers from "./lib/rules/enforce-ts-rest-in-controllers";
import requireHttpModuleFactory from "./lib/rules/require-http-module-factory";
import requireRunValidatorsWithUpsert from "./lib/rules/require-run-validators-with-upsert";

export const rules = {
  "enforce-ts-rest-in-controllers": enforceTsRestInControllers,
  "require-http-module-factory": requireHttpModuleFactory,
  "require-run-validators-with-upsert": requireRunValidatorsWithUpsert,
};
