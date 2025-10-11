import { isDefined } from "@clipboard-health/util-ts";

import {
  type TriggerIdempotencyKey,
  type TriggerIdempotencyKeyParams,
} from "../triggerIdempotencyKey";
import { createDeterministicHash } from "./createDeterministicHash";

export function triggerIdempotencyKeyToHash(params: {
  idempotencyKey: TriggerIdempotencyKey;
  workplaceId?: string | undefined;
}): string {
  const { idempotencyKey, workplaceId } = params;

  const parsed = JSON.parse(idempotencyKey) as TriggerIdempotencyKeyParams;

  return createDeterministicHash(
    [
      parsed.workflowKey,
      parsed.chunk,
      parsed.resourceId,
      parsed.eventOccurredAt,
      parsed.recipients.join(","),
      workplaceId,
    ]
      .filter(isDefined)
      .join(","),
  );
}
