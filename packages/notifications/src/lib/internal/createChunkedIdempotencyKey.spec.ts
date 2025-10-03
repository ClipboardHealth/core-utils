import { createChunkedIdempotencyKey } from "./createChunkedIdempotencyKey";

describe("createChunkedIdempotencyKey", () => {
  const MAX_IDEMPOTENCY_KEY_LENGTH = 255;

  it("returns base key when only one chunk", () => {
    const input = {
      baseKey: "test-idempotency-key",
      chunkIndex: 0,
      totalChunks: 1,
    };

    const actual = createChunkedIdempotencyKey(input);

    expect(actual).toBe("test-idempotency-key");
  });

  it("appends chunk suffix when multiple chunks", () => {
    const input = {
      baseKey: "test-idempotency-key",
      chunkIndex: 0,
      totalChunks: 2,
    };

    const actual = createChunkedIdempotencyKey(input);

    expect(actual).toBe("test-idempotency-key-chunk-1");
  });

  it("uses 1-based chunk indexing for readability", () => {
    const input = {
      baseKey: "test-key",
      chunkIndex: 2,
      totalChunks: 3,
    };

    const actual = createChunkedIdempotencyKey(input);

    expect(actual).toBe("test-key-chunk-3");
  });

  it("truncates long base key when single chunk", () => {
    const longBaseKey = "a".repeat(300);

    const actual = createChunkedIdempotencyKey({
      baseKey: longBaseKey,
      chunkIndex: 0,
      totalChunks: 1,
    });

    expect(actual).toBe("a".repeat(MAX_IDEMPOTENCY_KEY_LENGTH));
    expect(actual).toHaveLength(MAX_IDEMPOTENCY_KEY_LENGTH);
  });

  it("returns full key when base key + suffix fits within limit", () => {
    const baseKey = "short-key";

    const actual = createChunkedIdempotencyKey({
      baseKey,
      chunkIndex: 0,
      totalChunks: 2,
    });

    expect(actual).toBe("short-key-chunk-1");
    expect(actual.length).toBeLessThanOrEqual(MAX_IDEMPOTENCY_KEY_LENGTH);
  });

  it("truncates base key when full key exceeds limit", () => {
    const longBaseKey = "a".repeat(250);

    const actual = createChunkedIdempotencyKey({
      baseKey: longBaseKey,
      chunkIndex: 0,
      totalChunks: 2,
    });

    expect(actual).toHaveLength(MAX_IDEMPOTENCY_KEY_LENGTH);
    expect(actual).toMatch(/-chunk-1$/);
  });

  it("handles exactly at character limit", () => {
    const baseKey = "a".repeat(MAX_IDEMPOTENCY_KEY_LENGTH - "-chunk-1".length);

    const actual = createChunkedIdempotencyKey({
      baseKey,
      chunkIndex: 0,
      totalChunks: 2,
    });

    expect(actual).toHaveLength(MAX_IDEMPOTENCY_KEY_LENGTH);
    expect(actual).toBe(`${"a".repeat(MAX_IDEMPOTENCY_KEY_LENGTH - "-chunk-1".length)}-chunk-1`);
  });

  it("handles double-digit chunk numbers", () => {
    const baseKey = "test-key";

    const actual = createChunkedIdempotencyKey({
      baseKey,
      chunkIndex: 9,
      totalChunks: 15,
    });

    expect(actual).toBe("test-key-chunk-10");
  });

  it("truncates correctly with triple-digit chunk numbers", () => {
    const longBaseKey = "a".repeat(250);

    const actual = createChunkedIdempotencyKey({
      baseKey: longBaseKey,
      chunkIndex: 99,
      totalChunks: 150,
    });

    expect(actual).toHaveLength(MAX_IDEMPOTENCY_KEY_LENGTH);
    expect(actual).toMatch(/-chunk-100$/);
  });
});
