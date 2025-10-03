export const MAX_IDEMPOTENCY_KEY_LENGTH = 255;

/**
 * Creates a chunked idempotency key by appending a chunk suffix.
 *
 * If the idempotency key with the chunk suffix exceeds MAX_IDEMPOTENCY_KEY_LENGTH characters, it
 * truncates the base key to fit within the limit.
 *
 * @param params.baseKey - The base idempotency key
 * @param params.chunkIndex - Zero-based chunk index
 * @param params.totalChunks - Total number of chunks
 *
 * @returns An idempotency key with chunk information, max MAX_IDEMPOTENCY_KEY_LENGTH characters
 */
export function createChunkedIdempotencyKey(params: {
  baseKey: string;
  chunkIndex: number;
  totalChunks: number;
}): string {
  const { baseKey, chunkIndex, totalChunks } = params;

  if (totalChunks === 1) {
    return baseKey.slice(0, MAX_IDEMPOTENCY_KEY_LENGTH);
  }

  const chunkSuffix = `-chunk-${chunkIndex + 1}`;
  const maxBaseKeyLength = MAX_IDEMPOTENCY_KEY_LENGTH - chunkSuffix.length;
  const fullKey = `${baseKey}${chunkSuffix}`;

  return fullKey.length <= MAX_IDEMPOTENCY_KEY_LENGTH
    ? fullKey
    : `${baseKey.slice(0, maxBaseKeyLength)}${chunkSuffix}`;
}
