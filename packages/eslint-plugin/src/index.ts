import enforceTsRestInControllers from "./lib/rules/enforce-ts-rest-in-controllers";
import forbidObjectAssign from "./lib/rules/forbid-object-assign";
import requireHttpModuleFactory from "./lib/rules/require-http-module-factory";

export const rules = {
  "enforce-ts-rest-in-controllers": enforceTsRestInControllers,
  "require-http-module-factory": requireHttpModuleFactory,
  "forbid-object-assign": forbidObjectAssign,
};
