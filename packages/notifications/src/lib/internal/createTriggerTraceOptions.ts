import type { TraceOptions } from "../types";
import type { TriggerLogContext } from "./createTriggerLogParams";

export function createTriggerTraceOptions(
  params: TriggerLogContext & { expiresAt: Date },
): TraceOptions {
  const { key, attempt, idempotencyKey, expiresAt, destination } = params;

  return {
    resource: `notification.${key}`,
    tags: {
      "span.kind": "producer",
      component: "customer-notifications",
      "messaging.system": "knock.app",
      "messaging.operation": "publish",
      "messaging.destination": destination,
      "notification.attempt": attempt.toString(),
      "notification.idempotencyKey": idempotencyKey,
      "notification.expiresAt": expiresAt.toISOString(),
    },
  };
}
