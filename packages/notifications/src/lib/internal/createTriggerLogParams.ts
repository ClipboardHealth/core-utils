import type { LogParams, TriggerChunkedRequest, TriggerRequest } from "../types";

export type TriggerLogContext = LogParams &
  Pick<TriggerRequest, "attempt" | "dryRun" | "workflowKey"> & {
    idempotencyKey: string;
  };

type TriggerLogParamsInput = (TriggerRequest | TriggerChunkedRequest) & LogParams;

export function createTriggerLogParams(params: TriggerLogParamsInput): TriggerLogContext {
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
