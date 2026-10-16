export { createOxlintConfig } from "./internal/createOxlintConfig";
export {
  base,
  contractFixtures,
  customRules,
  frontend,
  jest,
  react,
  strict,
  strictTypeAware,
  typeAware,
  vitest,
} from "./internal/presets";
export type { CreateOxlintConfigRequest, OxlintPreset } from "./internal/types";
