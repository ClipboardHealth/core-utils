import type { LogParams, TriggerRequest } from "../types";

export type TriggerLogContext = LogParams &
  Pick<TriggerRequest, "attempt" | "idempotencyKey" | "key">;

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
