export interface IdempotencyKeyParams {
  /**
   * Prefer `resourceId` over `eventOccurredAt`; it's harder to misuse.
   *
   * If an event triggered your workflow and it doesn't have a unique ID, you may decide to use its
   * occurrence timestamp. For example, if you have a daily CRON job, use the date it ran.
   *
   * Take care when using `Date.now()` or `new Date()`. These change each time your job runs, which
   * means the idempotency key will always be different and doesn't prevent duplicate notifications.
   */
  eventOccurredAt?: Date | undefined;

  /**
   * If a resource triggered your workflow, include its unique ID.
   *
   * @note `workflowKey`, `recipients`, and `workplaceId` (if it exists in the trigger body) are
   * included in the idempotency key automatically.
   *
   * @example
   * 1. For a "meeting starts in one hour" notification, set resourceId to the meeting ID.
   * 2. For a payout notification, set resourceId to the payment ID.
   */
  resourceId?: string | undefined;
}

/**
 * Idempotency keys prevent duplicate notifications. They should be deterministic and remain the
 * same across retry logic.
 *
 * If you retry a request with the same idempotency key within 24 hours, the client returns the same
 * response as the original request.
 *
 * @note `workflowKey`, `recipients`, and `workplaceId` (if it exists in the trigger body) are
 * included in the idempotency key automatically.
 *
 * We provide this class because idempotency keys can be difficult to use correctly. If the key
 * changes on each retry (e.g., Date.now() or uuid.v4()), it won't prevent duplicate notifications.
 * Conversely, if you don't provide enough information, you prevent recipients from receiving
 * notifications they otherwise should have. For example, if you use the trigger key and the
 * recipient's ID as the idempotency key, but it's possible the recipient could receive the same
 * notification multiple times within the idempotency key's validity window, the recipient will only
 * receive the first notification.
 */
export class IdempotencyKey {
  protected readonly eventOccurredAt: IdempotencyKeyParams["eventOccurredAt"];
  protected readonly resourceId: IdempotencyKeyParams["resourceId"];

  public constructor(params: IdempotencyKeyParams) {
    const { eventOccurredAt, resourceId } = params;

    this.eventOccurredAt = eventOccurredAt;
    this.resourceId = resourceId;
  }
}
