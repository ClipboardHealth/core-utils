import { isNil } from "@clipboard-health/util-ts";
import { type Tagged } from "type-fest";

import {
  type IdempotencyKey,
  type IdempotencyKeyParts,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  type NotificationJobEnqueuer,
} from "./notificationJobEnqueuer";

/**
 * Idempotency keys prevent duplicate notifications. `NotificationClient.trigger` should be called
 * after properly enqueuing a job using `NotificationJobEnqueuer.enqueueOneOrMore` to help ensure
 * we're following best practices so customers don't receive duplicate or stale notifications.
 *
 * Yes, you could use an as assertion to create a TriggerIdempotencyKey and then call
 * `NotificationClient.trigger` directly. We're using the honor system in hopes that enforcement is
 * unnecessary.
 */
export type TriggerIdempotencyKey = Tagged<string, "TriggerIdempotencyKey">;

export type TriggerIdempotencyKeyParams = (IdempotencyKey | IdempotencyKeyParts) & {
  /**
   * The recipient chunk number.
   */
  chunk: number;

  /**
   * The recipients in the chunk; maximum of MAXIMUM_RECIPIENTS_COUNT.
   */
  recipients: string[];

  /**
   * The workflow key.
   */
  workflowKey: string;
};

/**
 * Type guard to check if a value is a valid TriggerIdempotencyKeyParams object.
 */
export function isTriggerIdempotencyKeyParams(
  value: unknown,
): value is TriggerIdempotencyKeyParams {
  if (isNil(value) || typeof value !== "object") {
    return false;
  }

  const params = value as TriggerIdempotencyKeyParams;
  return (
    "chunk" in params &&
    "workflowKey" in params &&
    "recipients" in params &&
    Array.isArray(params.recipients) &&
    params.recipients.every((recipient) => typeof recipient === "string")
  );
}

/**
 * For internal library use and testing only. Service code should use
 * {@link NotificationJobEnqueuer.enqueueOneOrMore} instead.
 */
export function DO_NOT_CALL_THIS_OUTSIDE_OF_TESTS(
  params: TriggerIdempotencyKeyParams,
): TriggerIdempotencyKey {
  // eslint-disable-next-line no-restricted-syntax -- allow test casts
  return JSON.stringify(params) as TriggerIdempotencyKey;
}
