import { chunk } from "@clipboard-health/util-ts";

import { MAXIMUM_RECIPIENTS_COUNT } from "../notificationClient";

/**
 * Chunks recipients into groups that don't exceed the maximum recipients count,
 * assigning a unique chunk number to each group.
 *
 * This function is used to split large recipient lists into smaller batches that
 * comply with notification provider limits. Each chunk is numbered sequentially
 * starting from 1.
 *
 * @param params - The chunking parameters
 * @param params.recipients - Array of recipient IDs to chunk
 * @returns Array of chunks, each containing a chunk number and recipients array
 */
export function chunkRecipients(params: {
  recipients: string[];
}): Array<{ number: number; recipients: string[] }> {
  const { recipients } = params;

  if (recipients.length === 0) {
    return [{ number: 1, recipients: [] }];
  }

  return chunk(recipients, MAXIMUM_RECIPIENTS_COUNT).map((recipientsChunk, index) => ({
    number: index + 1,
    recipients: recipientsChunk,
  }));
}
