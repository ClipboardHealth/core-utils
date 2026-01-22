// embedex: packages/notifications/examples/usage.md,packages/notifications/src/lib/notificationClient.ts
// triggerNotification.job.ts
import { type BaseHandler } from "@clipboard-health/background-jobs-adapter";
import {
  ERROR_CODES,
  type SerializableTriggerChunkedRequest,
  toTriggerChunkedRequest,
} from "@clipboard-health/notifications";
import { isFailure } from "@clipboard-health/util-ts";

import { type NotificationsService } from "./notifications.service";
import { CBHLogger } from "./setup";
import { TRIGGER_NOTIFICATION_JOB_NAME } from "./triggerNotification.constants";

/**
 * For @clipboard-health/mongo-jobs:
 * 1. Implement `HandlerInterface<SerializableTriggerChunkedRequest>`.
 * 2. The 10 default `maxAttempts` with exponential backoff of `2^attemptsCount` means ~17 minutes
 *    of cumulative delay. If your notification could be stale before this, set
 *    `SerializableTriggerChunkedRequest.expiresAt` when enqueueing.
 *
 * For @clipboard-health/background-jobs-postgres:
 * 1. Implement `Handler<SerializableTriggerChunkedRequest>`.
 * 2. The 20 default `maxRetryAttempts` with exponential backoff of `10s * 2^(attempt - 1)` means
 *    ~121 days of cumulative delay. If your notification could be stale before this, set
 *    `maxRetryAttempts` (and `SerializableTriggerChunkedRequest.expiresAt`) when enqueueing.
 */
export class TriggerNotificationJob implements BaseHandler<SerializableTriggerChunkedRequest> {
  // For background-jobs-postgres, use `public static queueName = TRIGGER_NOTIFICATION_JOB_NAME;`
  public name = TRIGGER_NOTIFICATION_JOB_NAME;
  private readonly logger = new CBHLogger({
    defaultMeta: {
      logContext: TRIGGER_NOTIFICATION_JOB_NAME,
    },
  });

  public constructor(private readonly service: NotificationsService) {}

  public async perform(
    data: SerializableTriggerChunkedRequest,
    /**
     * For mongo-jobs, implement `BackgroundJobType<SerializableTriggerChunkedRequest>`, which has
     *    `_id`, `attemptsCount`, and `uniqueKey`.
     *
     * For background-jobs-postgres, implement `Job<SerializableTriggerChunkedRequest>`, which has
     *    `id`, `retryAttempts`, and `idempotencyKey`.
     */
    job: { _id: string; attemptsCount: number; uniqueKey?: string },
  ) {
    const metadata = {
      // For background-jobs-postgres, this is called `retryAttempts`.
      attempt: job.attemptsCount + 1,
      jobId: job._id,
      recipientCount: data.body.recipients.length,
      workflowKey: data.workflowKey,
    };
    this.logger.info("TriggerNotificationJob processing", metadata);

    try {
      const request = toTriggerChunkedRequest(data, {
        attempt: metadata.attempt,
        idempotencyKey: job.uniqueKey ?? metadata.jobId,
        // In case the tests are moving the time forward we need to ensure notifications don't expire.
        // ...(isTestMode && { expiresAt: new Date(3000, 0, 1) }),
      });
      const result = await this.service.triggerChunked(request);

      if (isFailure(result)) {
        // Skip expired notifications, retrying the job won't help.
        if (result.error.issues[0]?.code === ERROR_CODES.expired) {
          this.logger.warn("TriggerNotificationJob skipped due to expiry", { ...metadata });
          return;
        }

        throw result.error;
      }

      const success = "TriggerNotificationJob success";
      this.logger.info(success, { ...metadata, response: result.value });
      // For background-jobs-postgres, return the `success` string result.
    } catch (error) {
      this.logger.error("TriggerNotificationJob failure", { ...metadata, error });
      throw error;
    }
  }
}
