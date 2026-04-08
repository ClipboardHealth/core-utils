import { isTriggerIdempotencyKeyParams } from "../triggerIdempotencyKey";
import type { TriggerIdempotencyKey, TriggerIdempotencyKeyParams } from "../triggerIdempotencyKey";

export function parseTriggerIdempotencyKey(params: {
  idempotencyKey: TriggerIdempotencyKey;
}): TriggerIdempotencyKeyParams | false {
  try {
    const parsed = JSON.parse(params.idempotencyKey) as unknown;
    if (isTriggerIdempotencyKeyParams(parsed)) {
      return parsed;
    }
  } catch {
    // Invalid; fall through
  }

  return false;
}
