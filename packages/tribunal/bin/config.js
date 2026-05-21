import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { cosmiconfig } from "cosmiconfig";

/** @typedef {{ TRIBUNAL_CONFIG_SEARCH_PLACES: string[] }} ConfigSearchPlacesModule */
/** @typedef {"anthropic" | "googleGenerativeAi" | "openai"} ApiKeyName */

const { TRIBUNAL_CONFIG_SEARCH_PLACES } = await importConfigSearchPlaces();

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
  const explorer = cosmiconfig("tribunal", { searchPlaces: [...TRIBUNAL_CONFIG_SEARCH_PLACES] });
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

/**
 * @returns {Promise<ConfigSearchPlacesModule>}
 */
async function importConfigSearchPlaces() {
  const compiledModuleUrl = new URL("../src/configSearchPlaces.js", import.meta.url);

  if (existsSync(fileURLToPath(compiledModuleUrl))) {
    return parseConfigSearchPlacesModule(await import(compiledModuleUrl.href));
  }

  return parseConfigSearchPlacesModule(
    await import(new URL("../src/configSearchPlaces.ts", import.meta.url).href),
  );
}

/**
 * @param {unknown} value
 * @returns {ConfigSearchPlacesModule}
 */
function parseConfigSearchPlacesModule(value) {
  if (!isRecord(value)) {
    throw new TypeError("Tribunal config search places module must be an object.");
  }

  const searchPlaces = value.TRIBUNAL_CONFIG_SEARCH_PLACES;

  if (!Array.isArray(searchPlaces)) {
    throw new TypeError("Tribunal config search places must be an array.");
  }

  /** @type {string[]} */
  const parsedSearchPlaces = [];

  for (const searchPlace of searchPlaces) {
    if (typeof searchPlace !== "string") {
      throw new TypeError("Tribunal config search places must be strings.");
    }

    parsedSearchPlaces.push(searchPlace);
  }

  return { TRIBUNAL_CONFIG_SEARCH_PLACES: parsedSearchPlaces };
}
