import type { OxlintConfig } from "oxlint";

export type OxlintPreset = Omit<OxlintConfig, "extends">;

export interface CreateOxlintConfigRequest {
  /**
   * Parsed lint-ceilings.json. Its per-file overrides go after every preset and local override,
   * so a later glob such as a test preset's `max-lines` cannot override a file's ceiling.
   */
  ceilings?: unknown;
  localConfig?: OxlintPreset;
  presets?: readonly OxlintPreset[];
}
