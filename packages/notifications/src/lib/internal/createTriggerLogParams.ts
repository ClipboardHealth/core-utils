import type { LogParams, TriggerRequest } from "../types";

export interface TriggerLogContext extends LogParams {
  attempt: number;
  idempotencyKey: string;
  key: string;
}

export function createTriggerLogParams(params: TriggerRequest & LogParams): TriggerLogContext {
  const { attempt, destination, idempotencyKey, key, traceName } = params;

  return {
    attempt,
    destination,
    idempotencyKey,
    key,
    traceName,
  };
}
