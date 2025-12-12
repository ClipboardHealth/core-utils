import { type TriggerIdempotencyKeyParams } from "../triggerIdempotencyKey";
import { createDeterministicHash } from "./createDeterministicHash";

type HashParams = TriggerIdempotencyKeyParams & {
  workplaceId?: string | undefined;
};

export function triggerIdempotencyKeyParamsToHash(params: HashParams): string {
  return createDeterministicHash(toSorted(params));
}

function toSorted(params: HashParams): HashParams {
  return {
    chunk: params.chunk,
    eventOccurredAt: params.eventOccurredAt,
    recipients: [...params.recipients].sort(),
    resourceId:
      "resourceId" in params
        ? params.resourceId
        : "resource" in params && params.resource && "id" in params.resource
          ? params.resource.id
          : undefined,
    workflowKey: params.workflowKey,
    workplaceId: params.workplaceId,
  };
}
