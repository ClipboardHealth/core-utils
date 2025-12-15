import type { LogParams, TriggerRequest } from "../types";

export type TriggerLogContext = LogParams &
  Pick<TriggerRequest, "attempt" | "dryRun" | "idempotencyKey" | "workflowKey">;

export function createTriggerLogParams(params: TriggerRequest & LogParams): TriggerLogContext {
  const { attempt, destination, dryRun = false, idempotencyKey, workflowKey, traceName } = params;

  return {
    attempt,
    destination,
    dryRun,
    idempotencyKey,
    workflowKey,
    traceName,
  };
}
