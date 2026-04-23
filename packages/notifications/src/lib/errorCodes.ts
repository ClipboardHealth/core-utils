export const ERROR_CODES = {
  /**
   * The third-party provider returned a non-429 4xx response. Retrying without changes is
   * unlikely to succeed; fix the request or inspect the error before retrying.
   */
  clientError: "clientError",
  expired: "expired",
  invalidExpiresAt: "invalidExpiresAt",
  invalidIdempotencyKey: "invalidIdempotencyKey",
  missingSigningKey: "missingSigningKey",
  /**
   * The third-party provider returned 429 (Too Many Requests). Callers should back off and
   * retry.
   */
  rateLimited: "rateLimited",
  recipientCountAboveMaximum: "recipientCountAboveMaximum",
  recipientCountBelowMinimum: "recipientCountBelowMinimum",
  unknown: "unknown",
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];
