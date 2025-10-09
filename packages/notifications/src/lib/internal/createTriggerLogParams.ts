import type { LogParams, TriggerRequest } from "../types";

export type TriggerLogContext = LogParams &
  Pick<TriggerRequest, "attempt" | "idempotencyKey" | "workflowKey">;

export function createTriggerLogParams(params: TriggerRequest & LogParams): TriggerLogContext {
  const { attempt, destination, idempotencyKey, key, workflowKey, traceName } = params;

  return {
    attempt,
    destination,
    idempotencyKey,
    workflowKey: workflowKey ?? /* istanbul ignore next */ key,
    traceName,
  };
}
