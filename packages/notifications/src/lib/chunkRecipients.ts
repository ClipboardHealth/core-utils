import { chunk } from "@clipboard-health/util-ts";

import { MAXIMUM_RECIPIENTS_COUNT } from "./notificationClient";

export function chunkRecipients(params: {
  idempotencyKey: string;
  recipients: string[];
}): Array<{ idempotencyKey: string; recipients: string[] }> {
  const { recipients, idempotencyKey } = params;

  if (recipients.length === 0) {
    return [{ idempotencyKey, recipients: [] }];
  }

  const idChunks = chunk(recipients, MAXIMUM_RECIPIENTS_COUNT);
  const singleChunk = idChunks.length === 1;
  return idChunks.map((ids, index) => ({
    idempotencyKey: singleChunk ? idempotencyKey : `${idempotencyKey}-chunk-${index + 1}`,
    recipients: ids,
  }));
}
