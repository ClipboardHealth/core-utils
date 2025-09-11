import enforceTsRestInControllers from "./lib/rules/enforce-ts-rest-in-controllers";
import noCrossModuleRepositoryUsage from "./lib/rules/no-cross-module-repository-usage";
import requireHttpModuleFactory from "./lib/rules/require-http-module-factory";

export const rules = {
  "enforce-ts-rest-in-controllers": enforceTsRestInControllers,
  "no-cross-module-repository-usage": noCrossModuleRepositoryUsage,
  "require-http-module-factory": requireHttpModuleFactory,
};
