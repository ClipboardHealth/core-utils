import { type TriggerIdempotencyKeyParams } from "../triggerIdempotencyKey";
import { createDeterministicHash } from "./createDeterministicHash";

interface HashParams extends TriggerIdempotencyKeyParams {
  workplaceId?: string | undefined;
}

export function triggerIdempotencyKeyParamsToHash(params: HashParams): string {
  return createDeterministicHash(toSorted(params));
}

function toSorted(params: HashParams): HashParams {
  return {
    chunk: params.chunk,
    eventOccurredAt: params.eventOccurredAt,
    recipients: [...params.recipients].sort(),
    resourceId: params.resourceId,
    workflowKey: params.workflowKey,
    workplaceId: params.workplaceId,
  };
}
