import type { LogParams, TriggerRequest } from "../types";

export type TriggerLogContext = LogParams &
  Pick<TriggerRequest, "attempt" | "idempotencyKey" | "workflowKey"> & { dryRun: boolean };

export function createTriggerLogParams(params: TriggerRequest & LogParams): TriggerLogContext {
  const { attempt, destination, dryRun, idempotencyKey, workflowKey, traceName } = params;

  return {
    attempt,
    destination,
    dryRun: dryRun ?? false,
    idempotencyKey,
    workflowKey,
    traceName,
  };
}
