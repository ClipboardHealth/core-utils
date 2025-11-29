import enforceTsRestInControllers from "./lib/rules/enforce-ts-rest-in-controllers";
import noNullishCoalescingZero from "./lib/rules/no-nullish-coalescing-zero";
import requireHttpModuleFactory from "./lib/rules/require-http-module-factory";

export const rules = {
  "enforce-ts-rest-in-controllers": enforceTsRestInControllers,
  "no-nullish-coalescing-zero": noNullishCoalescingZero,
  "require-http-module-factory": requireHttpModuleFactory,
};
