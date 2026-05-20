import { type ModelRole, type ModelSpec, parseModelRole } from "./models.ts";

export type ReasoningLevel = "none" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max";
export type ReasoningOverrides = Partial<Record<ModelRole, ReasoningLevel>>;

export interface ReasoningOverride {
  role: ModelRole;
  level: ReasoningLevel;
}

type ReasoningProviderOptionValue = string | Record<string, string>;

export type ReasoningProviderOptions = Record<string, Record<string, ReasoningProviderOptionValue>>;

const SUPPORTED_REASONING_LEVELS_BY_PROVIDER: Record<
  ModelSpec["provider"],
  ReadonlySet<ReasoningLevel>
> = {
  anthropic: new Set<ReasoningLevel>(["low", "medium", "high", "xhigh", "max"]),
  google: new Set<ReasoningLevel>(["minimal", "low", "medium", "high"]),
  openai: new Set<ReasoningLevel>(["none", "minimal", "low", "medium", "high", "xhigh"]),
};

export function parseReasoningOverride(input: string): ReasoningOverride {
  const separatorIndex = input.indexOf("=");

  if (separatorIndex <= 0 || separatorIndex === input.length - 1) {
    throw new Error(`Reasoning override must use role=level format. Received: ${input}`);
  }

  const roleInput = input.slice(0, separatorIndex).trim();
  const levelInput = input.slice(separatorIndex + 1).trim();

  if (roleInput.length === 0 || levelInput.length === 0) {
    throw new Error(`Reasoning override must use role=level format. Received: ${input}`);
  }

  return {
    level: parseReasoningLevel(levelInput),
    role: parseModelRole(roleInput),
  };
}

export function parseReasoningLevel(input: string): ReasoningLevel {
  switch (input) {
    case "none": {
      return input;
    }
    case "minimal": {
      return input;
    }
    case "low": {
      return input;
    }
    case "medium": {
      return input;
    }
    case "high": {
      return input;
    }
    case "xhigh": {
      return input;
    }
    case "max": {
      return input;
    }
    default: {
      throw new Error(`Unknown reasoning level: ${input}`);
    }
  }
}

export function createReasoningProviderOptions(input: {
  model: ModelSpec;
  reasoningLevel: ReasoningLevel | undefined;
}): ReasoningProviderOptions | undefined {
  const { model, reasoningLevel } = input;

  if (reasoningLevel === undefined) {
    return undefined;
  }

  assertReasoningLevelSupported(model.provider, reasoningLevel);

  switch (model.provider) {
    case "openai": {
      return { openai: { reasoningEffort: reasoningLevel } };
    }
    case "google": {
      return {
        google: {
          thinkingConfig: { thinkingLevel: reasoningLevel },
        },
      };
    }
    case "anthropic": {
      return { anthropic: { effort: reasoningLevel } };
    }
    default: {
      throw new Error("Unknown provider.");
    }
  }
}

function throwUnsupportedReasoningLevel(
  provider: ModelSpec["provider"],
  level: ReasoningLevel,
): never {
  throw new Error(`Reasoning level ${level} is not supported for ${provider} models.`);
}

function assertReasoningLevelSupported(
  provider: ModelSpec["provider"],
  level: ReasoningLevel,
): void {
  if (SUPPORTED_REASONING_LEVELS_BY_PROVIDER[provider].has(level)) {
    return;
  }

  throwUnsupportedReasoningLevel(provider, level);
}
