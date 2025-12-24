// embedex: packages/notifications/examples/usage.md
import { type BaseHandler } from "@clipboard-health/background-jobs-adapter";
import {
  type NotificationClient,
  type SerializableTriggerRequest,
} from "@clipboard-health/notifications";
import { isFailure } from "@clipboard-health/util-ts";

import { CBHLogger } from "./setup";
import { TRIGGER_NOTIFICATION_JOB_NAME } from "./triggerNotification.constants";

/**
 * For mongo-jobs, implement HandlerInterface<SerializableTriggerRequest>.
 * For background-jobs-postgres, implement Handler<SerializableTriggerRequest>.
 */
export class TriggerNotificationJob implements BaseHandler<SerializableTriggerRequest> {
  public name = TRIGGER_NOTIFICATION_JOB_NAME;
  private readonly logger = new CBHLogger({
    defaultMeta: {
      logContext: TRIGGER_NOTIFICATION_JOB_NAME,
    },
  });

  public constructor(private readonly client: NotificationClient) {}

  public async perform(
    data: SerializableTriggerRequest,
    job: { _id: string; attemptsCount: number; uniqueKey?: string },
  ) {
    const metadata = {
      attempt: job.attemptsCount + 1,
      jobId: job._id,
      workflowKey: data.workflowKey,
    };
    this.logger.info("Processing", metadata);

    try {
      const result = await this.client.triggerChunked({
        ...data,
        attempt: metadata.attempt,
        idempotencyKey: job.uniqueKey ?? metadata.jobId,
      });

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
