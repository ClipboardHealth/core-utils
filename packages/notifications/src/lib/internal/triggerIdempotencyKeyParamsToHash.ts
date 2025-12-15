import { type TriggerIdempotencyKeyParams } from "../triggerIdempotencyKey";
import { createDeterministicHash } from "./createDeterministicHash";

type HashParams = TriggerIdempotencyKeyParams & {
  workplaceId?: string | undefined;
};

export function triggerIdempotencyKeyParamsToHash(params: HashParams): string {
  return createDeterministicHash(toSorted(params));
}

function toSorted(params: HashParams) {
  return {
    chunk: params.chunk,
    eventOccurredAt: params.eventOccurredAt,
    recipients: [...params.recipients].sort(),
    resource: params.resource,
    workflowKey: params.workflowKey,
    workplaceId: params.workplaceId,
  };
}
