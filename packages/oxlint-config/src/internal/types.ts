// @ts-expect-error TS1541 type-only import from ESM package in CJS context
import type { OxlintConfig } from "oxlint";

export type OxlintPreset = Omit<OxlintConfig, "extends">;

export interface CreateOxlintConfigRequest {
  localConfig?: OxlintPreset;
  presets?: readonly OxlintPreset[];
}
