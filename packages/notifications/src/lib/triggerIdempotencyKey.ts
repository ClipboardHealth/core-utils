import { isDefined } from "@clipboard-health/util-ts";

import { IdempotencyKey, type IdempotencyKeyParams } from "./idempotencyKey";
import { createDeterministicHash } from "./internal/createDeterministicHash";
import {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  type NotificationJobEnqueuer,
} from "./notificationJobEnqueuer";

export interface TriggerIdempotencyKeyParams extends IdempotencyKeyParams {
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
 * Idempotency keys prevent duplicate notifications. `NotificationClient.trigger` should be called
 * after properly enqueuing a job using `NotificationJobEnqueuer.enqueueOneOrMore` to help ensure
 * we're following best practices so customers don't receive duplicate or stale notifications.
 *
 * Yes, you could import this class into your service, create an instance, and call
 * `NotificationClient.trigger` directly. We're using the honor system in hopes that enforcement is
 * unnecessary.
 *
 * @see {@link NotificationJobEnqueuer.enqueueOneOrMore}.
 */
export class TriggerIdempotencyKey extends IdempotencyKey {
  /**
   * For internal library use and testing only. Service code should use
   * {@link NotificationJobEnqueuer.enqueueOneOrMore} instead.
   *
   * @see {@link TriggerIdempotencyKey}.
   */
  public static DO_NOT_CALL_THIS_OUTSIDE_OF_TESTS(
    params: TriggerIdempotencyKeyParams,
  ): TriggerIdempotencyKey {
    return new TriggerIdempotencyKey(params);
  }

  private readonly chunk: TriggerIdempotencyKeyParams["chunk"];
  private readonly recipients: TriggerIdempotencyKeyParams["recipients"];
  private readonly workflowKey: TriggerIdempotencyKeyParams["workflowKey"];

  private constructor(params: TriggerIdempotencyKeyParams) {
    const { chunk, recipients, workflowKey, ...rest } = params;

    super(rest);
    this.chunk = chunk;
    this.recipients = recipients;
    this.workflowKey = workflowKey;
  }

  public toHash(params: { workplaceId?: string | undefined }): string {
    const { workplaceId } = params;

    return createDeterministicHash(
      [
        this.workflowKey,
        this.chunk,
        this.resourceId,
        this.eventOccurredAt?.toISOString(),
        this.recipients.join(","),
        workplaceId,
      ]
        .filter(isDefined)
        .join(","),
    );
  }
}
