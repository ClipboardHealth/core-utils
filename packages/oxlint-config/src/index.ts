export { checkNeverSuppressRules, NEVER_SUPPRESS_RULES } from "@clipboard-health/oxlint-plugin";
export { createOxlintConfig } from "./internal/createOxlintConfig";
export {
  base,
  contractFixtures,
  customRules,
  fast,
  frontend,
  jest,
  react,
  strict,
  strictTypeAware,
  suppressionPolicy,
  typeAware,
  vitest,
} from "./internal/presets";
export type { CreateOxlintConfigRequest, OxlintPreset } from "./internal/types";
