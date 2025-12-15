import { type TriggerIdempotencyKeyParams } from "../triggerIdempotencyKey";
import { createDeterministicHash } from "./createDeterministicHash";

type HashParams = TriggerIdempotencyKeyParams & {
  workplaceId?: string | undefined;
};

export function triggerIdempotencyKeyParamsToHash(params: HashParams): string {
  return createDeterministicHash(toSorted(params));
}

/**
 * Sort the object keys to ensure a deterministic hash.
 */
function toSorted(params: HashParams) {
  return {
    chunk: params.chunk,
    eventOccurredAt: params.eventOccurredAt,
    recipients: [...params.recipients].sort(),
    resource: {
      id: params.resource?.id,
      type: params.resource?.type,
    },
    workflowKey: params.workflowKey,
    workplaceId: params.workplaceId,
  };
}
