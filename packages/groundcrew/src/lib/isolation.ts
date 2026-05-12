/**
 * Strategy resolver — turns a user's `isolation` config plus host
 * capabilities into a concrete launch strategy. Pure: takes everything
 * it needs as arguments so callers can test without touching the host.
 */

import type { IsolationStrategy, ModelDefinition, ResolvedConfig } from "./config.js";
import type { HostCapabilities } from "./host.js";

/**
 * The concrete strategy that will run a model. `auto` is never returned —
 * it's resolved here against the host into one of the leaf strategies.
 */
export type ResolvedIsolationStrategy = "safehouse" | "docker" | "none";

export interface StrategyResolution {
  /** What requested the strategy: model override, global default, or auto. */
  requested: IsolationStrategy;
  resolved: ResolvedIsolationStrategy;
  /** One-line explanation of why `resolved` was chosen. */
  reason: string;
}

interface ResolveArguments {
  config: ResolvedConfig;
  model: string;
  host: HostCapabilities;
}

export function resolveIsolationStrategy(arguments_: ResolveArguments): StrategyResolution {
  const { config, model, host } = arguments_;
  const definition = config.models.definitions[model];
  if (definition === undefined) {
    throw new Error(`Unknown model: ${model}`);
  }

  const requested = definition.isolation ?? config.models.isolation;

  if (requested === "none") {
    return { requested, resolved: "none", reason: "isolation set to none" };
  }

  if (requested === "safehouse") {
    failIfSafehouseUnavailable(host);
    return { requested, resolved: "safehouse", reason: "isolation set to safehouse" };
  }

  if (requested === "docker") {
    failIfDockerUnavailable(model, definition, host);
    return { requested, resolved: "docker", reason: "isolation set to docker" };
  }

  return resolveAuto({ requested, definition, host });
}

function resolveAuto(arguments_: {
  requested: IsolationStrategy;
  definition: ModelDefinition;
  host: HostCapabilities;
}): StrategyResolution {
  const { requested, definition, host } = arguments_;

  if (host.hasSafehouse && host.isSafehouseSupported) {
    return { requested, resolved: "safehouse", reason: "auto: safehouse available on this host" };
  }

  if (definition.sandbox !== undefined && host.hasSbx) {
    return {
      requested,
      resolved: "docker",
      reason: "auto: safehouse unavailable, falling back to Docker Sandboxes",
    };
  }

  throw new Error(
    "isolation strategy 'auto' could not find an isolated runner. Install safehouse or Docker Sandboxes (`sbx`), configure a sandbox block for this model, or set isolation to 'none' explicitly to run directly.",
  );
}

function failIfSafehouseUnavailable(host: HostCapabilities): void {
  if (!host.isSafehouseSupported) {
    throw new Error(
      "isolation strategy 'safehouse' is only supported on macOS. Switch to 'docker' or 'none' on this platform.",
    );
  }
  if (!host.hasSafehouse) {
    throw new Error(
      "isolation strategy 'safehouse' is set but the safehouse binary is not on PATH. Install safehouse or change the strategy.",
    );
  }
}

function failIfDockerUnavailable(
  model: string,
  definition: ModelDefinition,
  host: HostCapabilities,
): void {
  if (definition.sandbox === undefined) {
    throw new Error(
      `isolation strategy 'docker' is set but model '${model}' has no sandbox config. Add a sandbox block (e.g., \`sandbox: { agent: "${model}" }\`) or change the strategy.`,
    );
  }
  if (!host.hasSbx) {
    throw new Error(
      "isolation strategy 'docker' is set but the sbx binary is not on PATH. Install Docker Sandboxes (`sbx`) or change the strategy.",
    );
  }
}
