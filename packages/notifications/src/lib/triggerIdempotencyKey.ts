import {
  type IdempotencyKey,
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
export type TriggerIdempotencyKey = string & { __brand: "TriggerIdempotencyKey" };

export interface TriggerIdempotencyKeyParams extends IdempotencyKey {
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
}

/**
 * For internal library use and testing only. Service code should use
 * {@link NotificationJobEnqueuer.enqueueOneOrMore} instead.
 */
export function DO_NOT_CALL_THIS_OUTSIDE_OF_TESTS(
  params: TriggerIdempotencyKeyParams,
): TriggerIdempotencyKey {
  return JSON.stringify(params) as TriggerIdempotencyKey;
}
