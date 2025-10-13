import {
  isTriggerIdempotencyKeyParams,
  type TriggerIdempotencyKey,
  type TriggerIdempotencyKeyParams,
} from "../triggerIdempotencyKey";
import { triggerIdempotencyKeyParamsToHash } from "./triggerIdempotencyKeyParamsToHash";

export function parseTriggerIdempotencyKey(params: {
  idempotencyKey: TriggerIdempotencyKey | string;
  workplaceId?: string | undefined;
}): string {
  const { idempotencyKey, workplaceId } = params;

  try {
    const parsed = JSON.parse(idempotencyKey) as Partial<TriggerIdempotencyKeyParams>;
    if (isTriggerIdempotencyKeyParams(parsed)) {
      return triggerIdempotencyKeyParamsToHash({ ...parsed, workplaceId });
    }
  } catch {
    // Not a branded key; fall through
  }

  return idempotencyKey;
}
