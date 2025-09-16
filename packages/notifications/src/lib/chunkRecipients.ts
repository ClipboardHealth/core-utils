import { chunk } from "@clipboard-health/util-ts";

import { MAXIMUM_RECIPIENTS_COUNT } from "./notificationClient";

export function chunkRecipients(params: {
  idempotencyKey: string;
  recipientIds: string[];
}): Array<{ idempotencyKey: string; recipientIds: string[] }> {
  const { recipientIds, idempotencyKey } = params;

  if (recipientIds.length === 0) {
    return [{ idempotencyKey, recipientIds: [] }];
  }

  const idChunks = chunk(recipientIds, MAXIMUM_RECIPIENTS_COUNT);
  const singleChunk = idChunks.length === 1;
  return idChunks.map((ids, index) => ({
    idempotencyKey: singleChunk ? idempotencyKey : `${idempotencyKey}-chunk-${index + 1}`,
    recipientIds: ids,
  }));
}
