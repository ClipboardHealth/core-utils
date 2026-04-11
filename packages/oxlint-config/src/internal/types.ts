// eslint-disable-next-line @typescript-eslint/ban-ts-comment, @typescript-eslint/prefer-ts-expect-error
// @ts-ignore TS1541 type-only import from ESM package in CJS context
import type { OxlintConfig } from "oxlint";

export type OxlintPreset = Omit<OxlintConfig, "extends">;

export interface CreateOxlintConfigRequest {
  localConfig?: OxlintPreset;
  presets?: readonly OxlintPreset[];
}
