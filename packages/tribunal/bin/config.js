import { cosmiconfig } from "cosmiconfig";

const SEARCH_PLACES = [
  "package.json",
  ".tribunalrc",
  ".tribunalrc.json",
  ".tribunalrc.yaml",
  ".tribunalrc.yml",
  ".tribunalrc.js",
  ".tribunalrc.cjs",
  ".tribunalrc.mjs",
  "tribunal.config.json",
  "tribunal.config.js",
  "tribunal.config.cjs",
  "tribunal.config.mjs",
];

/** @typedef {"anthropic" | "googleGenerativeAi" | "openai"} ApiKeyName */

/** @type {Record<ApiKeyName, string>} */
const API_KEY_ENVIRONMENT_VARIABLES = {
  anthropic: "ANTHROPIC_API_KEY",
  googleGenerativeAi: "GOOGLE_GENERATIVE_AI_API_KEY",
  openai: "OPENAI_API_KEY",
};

/**
 * @param {{ cwd?: string }} [input]
 * @returns {Promise<Record<string, string>>}
 */
export async function loadConfiguredApiKeyEnvironment(input = {}) {
  const cwd = input.cwd ?? process.cwd();
  const explorer = cosmiconfig("tribunal", { searchPlaces: SEARCH_PLACES });
  const result = await explorer.search(cwd);

  if (result === null || result.isEmpty === true) {
    return {};
  }

  return createApiKeyEnvironment(result.config, result.filepath);
}

/**
 * @param {unknown} config
 * @param {string} filepath
 * @returns {Record<string, string>}
 */
function createApiKeyEnvironment(config, filepath) {
  if (!isRecord(config)) {
    throw new Error(`Tribunal config at ${filepath} must be an object.`);
  }

  const { apiKeys } = config;

  if (apiKeys === undefined) {
    return {};
  }

  if (!isRecord(apiKeys)) {
    throw new Error(`Tribunal config apiKeys at ${filepath} must be an object.`);
  }

  return {
    ...createEnvironmentValue(apiKeys, "anthropic"),
    ...createEnvironmentValue(apiKeys, "googleGenerativeAi"),
    ...createEnvironmentValue(apiKeys, "openai"),
  };
}

/**
 * @param {Record<string, unknown>} apiKeys
 * @param {ApiKeyName} key
 * @returns {Record<string, string>}
 */
function createEnvironmentValue(apiKeys, key) {
  const value = apiKeys[key];

  if (value === undefined) {
    return {};
  }

  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Tribunal config apiKeys.${key} must be a non-empty string.`);
  }

  return { [API_KEY_ENVIRONMENT_VARIABLES[key]]: value };
}

/**
 * @param {unknown} value
 * @returns {value is Record<string, unknown>}
 */
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
