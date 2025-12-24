// embedex: packages/notifications/examples/usage.md
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
 * For mongo-jobs, implement HandlerInterface<SerializableTriggerChunkedRequest>.
 * For background-jobs-postgres, implement Handler<SerializableTriggerChunkedRequest>.
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
    job: { _id: string; attemptsCount: number; uniqueKey?: string },
  ) {
    const metadata = {
      // Include the job's attempts count for debugging, this is called `retryAttempts` in `background-jobs-postgres`.
      attempt: job.attemptsCount + 1,
      jobId: job._id,
      recipientCount: data.body.recipients.length,
      workflowKey: data.workflowKey,
    };
    this.logger.info("Processing", metadata);

    try {
      const request = toTriggerChunkedRequest(data, {
        attempt: metadata.attempt,
        idempotencyKey: job.uniqueKey ?? metadata.jobId,
      });
      const result = await this.service.triggerChunked(request);

      if (isFailure(result)) {
        throw result.error;
      }

      this.logger.info("Success", { ...metadata, response: result.value });
    } catch (error) {
      this.logger.error("Failure", { ...metadata, error });
      throw error;
    }
  }
}
