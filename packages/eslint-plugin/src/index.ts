import enforceTsRestInControllers from "./lib/rules/enforce-ts-rest-in-controllers";
import noSwallowedInvariantGuard from "./lib/rules/no-swallowed-invariant-guard";
import requireHttpModuleFactory from "./lib/rules/require-http-module-factory";
import requireRunValidatorsWithUpsert from "./lib/rules/require-run-validators-with-upsert";

export const rules = {
  "enforce-ts-rest-in-controllers": enforceTsRestInControllers,
  "no-swallowed-invariant-guard": noSwallowedInvariantGuard,
  "require-http-module-factory": requireHttpModuleFactory,
  "require-run-validators-with-upsert": requireRunValidatorsWithUpsert,
};
