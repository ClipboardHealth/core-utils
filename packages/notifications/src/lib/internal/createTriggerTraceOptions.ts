import type { TraceOptions } from "../types";
import type { TriggerLogContext } from "./createTriggerLogParams";

export function createTriggerTraceOptions(params: TriggerLogContext): TraceOptions {
  const { workflowKey, attempt, destination, dryRun } = params;

  return {
    resource: `notification.${workflowKey}`,
    /**
     * Don't include high cardinality tags like expiresAt and idempotencyKey to reduce Datadog
     * costs.
     */
    tags: {
      "span.kind": "producer",
      component: "customer-notifications",
      "messaging.system": "knock.app",
      "messaging.operation": "publish",
      "messaging.destination": destination,
      "notification.attempt": attempt.toString(),
      "notification.dryRun": String(dryRun),
    },
  };
}
