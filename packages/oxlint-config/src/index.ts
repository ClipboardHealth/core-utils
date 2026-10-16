export { createOxlintConfig } from "./internal/createOxlintConfig";
export {
  base,
  changedCode,
  changedCodeTypeAware,
  contractFixtures,
  customRules,
  frontend,
  jest,
  react,
  typeAware,
  vitest,
} from "./internal/presets";
export type { CreateOxlintConfigRequest, OxlintPreset } from "./internal/types";
