// embedex: packages/notifications/examples/usage.md,packages/notifications/src/lib/notificationClient.ts
// triggerNotification.job.ts
import { type BaseHandler } from "@clipboard-health/background-jobs-adapter";
import {
  type SerializableTriggerChunkedRequest,
  toTriggerChunkedRequest,
} from "@clipboard-health/notifications";
import { isFailure } from "@clipboard-health/util-ts";

import { type NotificationsService } from "./notifications.service";
import { CBHLogger } from "./setup";
import { TRIGGER_NOTIFICATION_JOB_NAME } from "./triggerNotification.constants";

/**
 * For mongo-jobs, implement `HandlerInterface<SerializableTriggerChunkedRequest>`.
 * For background-jobs-postgres, implement `Handler<SerializableTriggerChunkedRequest>`.
 */
export class TriggerNotificationJob implements BaseHandler<SerializableTriggerChunkedRequest> {
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
     * For mongo-jobs, implement `BackgroundJobType<SerializableTriggerChunkedRequest>`, which has _id, attemptsCount, and uniqueKey.
     * For background-jobs-postgres, implement `Job<SerializableTriggerChunkedRequest>`, which has id, retryAttempts, and idempotencyKey.
     */
    job: { _id: string; attemptsCount: number; uniqueKey?: string },
  ) {
    const metadata = {
      // Include the job's attempts count for debugging, this is called `retryAttempts` in `background-jobs-postgres`.
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
      });
      const result = await this.service.triggerChunked(request);

      if (isFailure(result)) {
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
