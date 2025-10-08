import { isDefined } from "@clipboard-health/util-ts";

import { IdempotencyKey, type IdempotencyKeyParams } from "../idempotencyKey";
import {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  type NotificationJobEnqueuer,
} from "../notificationJobEnqueuer";
import { createDeterministicHash } from "./createDeterministicHash";

interface IdempotencyKeyDoNotImportOutsideNotificationsLibraryParams extends IdempotencyKeyParams {
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
 * Yes, you could import this class into your service and call `NotificationClient.trigger`
 * directly. We're using the honor system in hopes that enforcement is unnecessary.
 *
 * @see {@link NotificationJobEnqueuer.enqueueOneOrMore}.
 */
export class IdempotencyKeyDoNotImportOutsideNotificationsLibrary extends IdempotencyKey {
  private readonly chunk: IdempotencyKeyDoNotImportOutsideNotificationsLibraryParams["chunk"];
  private readonly recipients: IdempotencyKeyDoNotImportOutsideNotificationsLibraryParams["recipients"];
  private readonly workflowKey: IdempotencyKeyDoNotImportOutsideNotificationsLibraryParams["workflowKey"];

  constructor(params: IdempotencyKeyDoNotImportOutsideNotificationsLibraryParams) {
    const { chunk, recipients, workflowKey, ...rest } = params;

    super(rest);
    this.chunk = chunk;
    this.recipients = recipients;
    this.workflowKey = workflowKey;
  }

  toHash(params: { workplaceId?: string | undefined }): string {
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
