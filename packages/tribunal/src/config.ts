import { cosmiconfig } from "cosmiconfig";
import { z } from "zod";

import { TRIBUNAL_CONFIG_SEARCH_PLACES } from "./configSearchPlaces.ts";
import { type ModelRole, type ModelSpec, parseModelSpec } from "./models.ts";
import { parseReasoningLevel, type ReasoningOverrides } from "./reasoning.ts";
import type { OutputFormat } from "./tribunal.ts";

type TribunalApiKeyName = "anthropic" | "openai" | "googleGenerativeAi";

export interface TribunalConfig {
  apiKeys: Partial<Record<TribunalApiKeyName, string>>;
  models: Partial<Record<ModelRole, ModelSpec>>;
  reasoning: ReasoningOverrides;
  outputFormat?: OutputFormat;
  showPerspectives?: boolean;
  saveIntermediates?: boolean;
}

interface TribunalConfigSearchResult {
  config: unknown;
  filepath: string;
  isEmpty?: boolean;
}

export interface LoadTribunalConfigInput {
  cwd: string;
  search?: (cwd: string) => Promise<TribunalConfigSearchResult | null>;
}

const API_KEY_ENVIRONMENT_VARIABLES: Record<TribunalApiKeyName, string> = {
  anthropic: "ANTHROPIC_API_KEY",
  googleGenerativeAi: "GOOGLE_GENERATIVE_AI_API_KEY",
  openai: "OPENAI_API_KEY",
};

const rawApiKeysSchema = z
  .object({
    anthropic: z.string().min(1).optional(),
    googleGenerativeAi: z.string().min(1).optional(),
    openai: z.string().min(1).optional(),
  })
  .strict();

const rawModelConfigSchema = z
  .object({
    advocate: z.string().min(1).optional(),
    analyst: z.string().min(1).optional(),
    deliberator: z.string().min(1).optional(),
    skeptic: z.string().min(1).optional(),
  })
  .strict();

const rawReasoningConfigSchema = z
  .object({
    advocate: z.string().min(1).optional(),
    analyst: z.string().min(1).optional(),
    deliberator: z.string().min(1).optional(),
    skeptic: z.string().min(1).optional(),
  })
  .strict();

const rawTribunalConfigSchema = z
  .object({
    apiKeys: rawApiKeysSchema.optional(),
    models: rawModelConfigSchema.optional(),
    outputFormat: z.enum(["text", "json", "markdown"]).optional(),
    reasoning: rawReasoningConfigSchema.optional(),
    saveIntermediates: z.boolean().optional(),
    showPerspectives: z.boolean().optional(),
  })
  .strict();

type RawTribunalConfig = z.infer<typeof rawTribunalConfigSchema>;

export async function loadTribunalConfig(input: LoadTribunalConfigInput): Promise<TribunalConfig> {
  const search = input.search ?? createTribunalConfigSearch();
  const result = await search(input.cwd);

  if (result === null || result.isEmpty === true) {
    return createEmptyTribunalConfig();
  }

  try {
    return parseTribunalConfig(result.config);
  } catch (error) {
    throw new Error(
      `Failed to parse Tribunal config at ${result.filepath}: ${formatConfigError(error)}`,
      { cause: error },
    );
  }
}

export function parseTribunalConfig(config: unknown): TribunalConfig {
  const rawConfig = rawTribunalConfigSchema.parse(config);
  const tribunalConfig = createEmptyTribunalConfig();

  assignApiKeys(tribunalConfig, rawConfig.apiKeys);
  assignModels(tribunalConfig, rawConfig.models);
  assignReasoning(tribunalConfig, rawConfig.reasoning);
  assignOutputFormat(tribunalConfig, rawConfig.outputFormat);
  assignBooleanConfigValue(tribunalConfig, "saveIntermediates", rawConfig.saveIntermediates);
  assignBooleanConfigValue(tribunalConfig, "showPerspectives", rawConfig.showPerspectives);

  return tribunalConfig;
}

export function createEnvironmentWithTribunalConfig(input: {
  config: TribunalConfig;
  environment: Record<string, string | undefined>;
}): Record<string, string | undefined> {
  const environment = { ...input.environment };

  assignConfiguredApiKey(environment, input.config, "anthropic");
  assignConfiguredApiKey(environment, input.config, "googleGenerativeAi");
  assignConfiguredApiKey(environment, input.config, "openai");

  return environment;
}

export function applyTribunalConfigToProcessEnvironment(config: TribunalConfig): void {
  // oxlint-disable-next-line node/no-process-env -- The provider SDKs read API keys from process.env, so config-provided keys must be installed before model creation.
  const environment = process.env;

  assignConfiguredApiKey(environment, config, "anthropic");
  assignConfiguredApiKey(environment, config, "googleGenerativeAi");
  assignConfiguredApiKey(environment, config, "openai");
}

export function createEmptyTribunalConfig(): TribunalConfig {
  return {
    apiKeys: {},
    models: {},
    reasoning: {},
  };
}

function createTribunalConfigSearch(): (cwd: string) => Promise<TribunalConfigSearchResult | null> {
  const explorer = cosmiconfig("tribunal", {
    searchPlaces: [...TRIBUNAL_CONFIG_SEARCH_PLACES],
  });

  return async (cwd) => await explorer.search(cwd);
}

function assignApiKeys(config: TribunalConfig, rawApiKeys: RawTribunalConfig["apiKeys"]): void {
  if (rawApiKeys === undefined) {
    return;
  }

  assignApiKey(config, "anthropic", rawApiKeys.anthropic);
  assignApiKey(config, "googleGenerativeAi", rawApiKeys.googleGenerativeAi);
  assignApiKey(config, "openai", rawApiKeys.openai);
}

function assignApiKey(
  config: TribunalConfig,
  key: TribunalApiKeyName,
  value: string | undefined,
): void {
  if (value === undefined) {
    return;
  }

  config.apiKeys[key] = value;
}

function assignModels(config: TribunalConfig, rawModels: RawTribunalConfig["models"]): void {
  if (rawModels === undefined) {
    return;
  }

  assignModel(config, "advocate", rawModels.advocate);
  assignModel(config, "analyst", rawModels.analyst);
  assignModel(config, "deliberator", rawModels.deliberator);
  assignModel(config, "skeptic", rawModels.skeptic);
}

function assignModel(config: TribunalConfig, role: ModelRole, value: string | undefined): void {
  if (value === undefined) {
    return;
  }

  try {
    config.models[role] = parseModelSpec(value);
  } catch (error) {
    throw new Error(`Invalid models.${role}: ${formatErrorMessage(error)}`, { cause: error });
  }
}

function assignReasoning(
  config: TribunalConfig,
  rawReasoning: RawTribunalConfig["reasoning"],
): void {
  if (rawReasoning === undefined) {
    return;
  }

  assignReasoningLevel(config, "advocate", rawReasoning.advocate);
  assignReasoningLevel(config, "analyst", rawReasoning.analyst);
  assignReasoningLevel(config, "deliberator", rawReasoning.deliberator);
  assignReasoningLevel(config, "skeptic", rawReasoning.skeptic);
}

function assignReasoningLevel(
  config: TribunalConfig,
  role: ModelRole,
  value: string | undefined,
): void {
  if (value === undefined) {
    return;
  }

  try {
    config.reasoning[role] = parseReasoningLevel(value);
  } catch (error) {
    throw new Error(`Invalid reasoning.${role}: ${formatErrorMessage(error)}`, { cause: error });
  }
}

function assignOutputFormat(config: TribunalConfig, outputFormat: OutputFormat | undefined): void {
  if (outputFormat === undefined) {
    return;
  }

  config.outputFormat = outputFormat;
}

function assignBooleanConfigValue(
  config: TribunalConfig,
  key: "saveIntermediates" | "showPerspectives",
  value: boolean | undefined,
): void {
  if (value === undefined) {
    return;
  }

  config[key] = value;
}

function assignConfiguredApiKey(
  environment: Record<string, string | undefined>,
  config: TribunalConfig,
  key: TribunalApiKeyName,
): void {
  const value = config.apiKeys[key];
  const environmentVariable = API_KEY_ENVIRONMENT_VARIABLES[key];

  if (value === undefined) {
    return;
  }

  const currentValue = environment[environmentVariable];

  if (currentValue !== undefined && currentValue.trim().length > 0) {
    return;
  }

  environment[environmentVariable] = value;
}

function formatConfigError(error: unknown): string {
  if (error instanceof z.ZodError) {
    return error.issues
      .map((issue) => `${formatConfigPath(issue.path)}: ${issue.message}`)
      .join("; ");
  }

  return formatErrorMessage(error);
}

function formatConfigPath(path: (string | number)[]): string {
  if (path.length === 0) {
    return "config";
  }

  return path.join(".");
}

function formatErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
