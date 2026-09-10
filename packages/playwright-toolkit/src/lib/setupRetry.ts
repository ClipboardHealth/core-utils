import { isRecord } from "@clipboard-health/util-ts";

export type SetupRetryClassification = "deterministic" | "identity-collision" | "transient";
export type SetupRetryDecision = "do-not-retry" | "regenerate-identity" | "retry-same-identity";

export interface SetupRetryResult {
  classification: SetupRetryClassification;
  retryDecision: SetupRetryDecision;
}

export interface SetupErrorContext {
  error: unknown;
  status: number | undefined;
}

export interface ClassifySetupRetryParams {
  error: unknown;
  isIdentityCollision?: (context: SetupErrorContext) => boolean;
  isTransientError?: (context: SetupErrorContext) => boolean;
}

/**
 * Classifies setup failures without conflating identity collisions and
 * transient infrastructure errors.
 *
 * Collision retries must regenerate a fresh identity. Transient retries must
 * repeat the same identity so they do not change the scenario under test.
 */
export function classifySetupRetry(params: ClassifySetupRetryParams): SetupRetryResult {
  const context = {
    error: params.error,
    status: getHttpErrorStatus({ error: params.error }),
  };

  if (params.isIdentityCollision?.(context) === true) {
    return {
      classification: "identity-collision",
      retryDecision: "regenerate-identity",
    };
  }

  if (
    isRetryableHttpStatus({ status: context.status }) ||
    params.isTransientError?.(context) === true
  ) {
    return {
      classification: "transient",
      retryDecision: "retry-same-identity",
    };
  }

  return {
    classification: "deterministic",
    retryDecision: "do-not-retry",
  };
}

export function isRetryableHttpStatus(params: { status: number | undefined }): boolean {
  return (
    params.status === 408 ||
    params.status === 429 ||
    (typeof params.status === "number" && params.status >= 500 && params.status <= 599)
  );
}

export function getHttpErrorStatus(params: { error: unknown }): number | undefined {
  if (!isRecord(params.error)) {
    return undefined;
  }

  if (typeof params.error["status"] === "number") {
    return params.error["status"];
  }

  const response = params.error["response"];
  if (isRecord(response) && typeof response["status"] === "number") {
    return response["status"];
  }

  return undefined;
}
