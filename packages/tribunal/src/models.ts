import { anthropic } from "@ai-sdk/anthropic";
import { google } from "@ai-sdk/google";
import { openai } from "@ai-sdk/openai";
import type { LanguageModel } from "ai";

import type { Role } from "./schemas.ts";

type ProviderId = "anthropic" | "openai" | "google";
export type ModelRole = Role | "deliberator";

export interface ModelSpec {
  provider: ProviderId;
  modelId: string;
}

interface ModelOverride {
  role: Role;
  model: ModelSpec;
}

export interface ResolveModelSetInput {
  overrides?: Partial<Record<ModelRole, ModelSpec>>;
  environment?: Record<string, string | undefined>;
}

export const DEFAULT_MODELS: Record<ModelRole, ModelSpec> = {
  advocate: { provider: "anthropic", modelId: "claude-opus-4-7" },
  skeptic: { provider: "openai", modelId: "gpt-5.4" },
  analyst: { provider: "google", modelId: "gemini-3.1-pro-preview" },
  deliberator: { provider: "anthropic", modelId: "claude-opus-4-7" },
};

const MODEL_ENVIRONMENT_VARIABLES: Record<ModelRole, string> = {
  advocate: "TRIBUNAL_ADVOCATE_MODEL",
  skeptic: "TRIBUNAL_SKEPTIC_MODEL",
  analyst: "TRIBUNAL_ANALYST_MODEL",
  deliberator: "TRIBUNAL_DELIBERATOR_MODEL",
};

export function parseModelSpec(input: string): ModelSpec {
  const separatorIndex = input.indexOf(":");

  if (separatorIndex <= 0 || separatorIndex === input.length - 1) {
    throw new Error(`Model must use provider:model-id format. Received: ${input}`);
  }

  const providerInput = input.slice(0, separatorIndex).trim();
  const modelId = input.slice(separatorIndex + 1).trim();

  if (providerInput.length === 0 || modelId.length === 0) {
    throw new Error(`Model must use provider:model-id format. Received: ${input}`);
  }

  const provider = parseProviderId(providerInput);

  return { provider, modelId };
}

export function parseModelOverride(input: string): ModelOverride {
  const separatorIndex = input.indexOf("=");

  if (separatorIndex <= 0 || separatorIndex === input.length - 1) {
    throw new Error(`Model override must use role=provider:model-id format. Received: ${input}`);
  }

  const roleInput = input.slice(0, separatorIndex);
  const modelInput = input.slice(separatorIndex + 1);

  if (roleInput === "deliberator") {
    throw new Error("Use --deliberator to override the deliberator model.");
  }

  return {
    role: parseRole(roleInput),
    model: parseModelSpec(modelInput),
  };
}

export function parseModelRole(input: string): ModelRole {
  switch (input) {
    case "advocate": {
      return input;
    }
    case "skeptic": {
      return input;
    }
    case "analyst": {
      return input;
    }
    case "deliberator": {
      return input;
    }
    default: {
      throw new Error(`Unknown model role: ${input}`);
    }
  }
}

export function resolveModelSet(input: ResolveModelSetInput = {}): Record<ModelRole, ModelSpec> {
  const { environment = {}, overrides = {} } = input;

  return {
    advocate: resolveModelForRole({ environment, overrides, role: "advocate" }),
    skeptic: resolveModelForRole({ environment, overrides, role: "skeptic" }),
    analyst: resolveModelForRole({ environment, overrides, role: "analyst" }),
    deliberator: resolveModelForRole({ environment, overrides, role: "deliberator" }),
  };
}

export function resolveLanguageModel(spec: ModelSpec): LanguageModel {
  switch (spec.provider) {
    case "anthropic": {
      return anthropic(spec.modelId);
    }
    case "openai": {
      return openai(spec.modelId);
    }
    case "google": {
      return google(spec.modelId);
    }
    default: {
      throw new Error("Unknown provider.");
    }
  }
}

export function formatModelSpec(spec: ModelSpec): string {
  return `${spec.provider}:${spec.modelId}`;
}

function resolveModelForRole(input: {
  role: ModelRole;
  environment: Record<string, string | undefined>;
  overrides: Partial<Record<ModelRole, ModelSpec>>;
}): ModelSpec {
  const { environment, overrides, role } = input;
  const override = overrides[role];

  if (override !== undefined) {
    return override;
  }

  const environmentValue = environment[MODEL_ENVIRONMENT_VARIABLES[role]];

  if (environmentValue !== undefined && environmentValue.trim().length > 0) {
    return parseModelSpec(environmentValue);
  }

  return DEFAULT_MODELS[role];
}

function parseProviderId(input: string): ProviderId {
  switch (input) {
    case "anthropic": {
      return input;
    }
    case "openai": {
      return input;
    }
    case "google": {
      return input;
    }
    default: {
      throw new Error(`Unknown provider: ${input}`);
    }
  }
}

function parseRole(input: string): Role {
  const role = parseModelRole(input);

  if (role === "deliberator") {
    throw new Error(`Unknown perspective role: ${input}`);
  }

  return role;
}
