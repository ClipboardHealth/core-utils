import { createDeterministicHash } from "@clipboard-health/util-ts";

import type { TriggerIdempotencyKeyParams } from "../triggerIdempotencyKey";

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
    // oxlint-disable-next-line unicorn/no-array-sort -- ESLint no-use-extend-native doesn't recognize toSorted() as standard
    recipients: [...params.recipients].sort(),
    resource: {
      id: params.resource?.id,
      type: params.resource?.type,
    },
    workflowKey: params.workflowKey,
    workplaceId: params.workplaceId,
  };
}
