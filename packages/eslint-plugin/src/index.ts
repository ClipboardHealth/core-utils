import enforceTsRestInControllers from "./lib/rules/enforce-ts-rest-in-controllers";
import requireHttpModuleFactory from "./lib/rules/require-http-module-factory";

export const rules = {
  "enforce-ts-rest-in-controllers": enforceTsRestInControllers,
  "require-http-module-factory": requireHttpModuleFactory,
};
