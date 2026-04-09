import type { OxlintConfig } from "oxlint";

export type OxlintPreset = Omit<OxlintConfig, "extends">;

export interface CreateOxlintConfigRequest {
  localConfig?: OxlintPreset;
  presets?: readonly OxlintPreset[];
}
