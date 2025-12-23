// embedex: packages/notifications/examples/usage.md
import { type BaseHandler } from "@clipboard-health/background-jobs-adapter";
import { isFailure } from "@clipboard-health/util-ts";

import {
  EXAMPLE_NOTIFICATION_JOB_NAME,
  type ExampleNotificationDataJob,
} from "./exampleNotification.constants";
import { type ExampleNotificationService } from "./exampleNotification.service";
import { CBHLogger } from "./setup";

// For mongo-jobs, you'll implement HandlerInterface<ExampleNotificationDataJob>
// For background-jobs-postgres, you'll implement Handler<ExampleNotificationDataJob>
export class ExampleNotificationJob implements BaseHandler<ExampleNotificationDataJob> {
  public name = EXAMPLE_NOTIFICATION_JOB_NAME;
  private readonly logger = new CBHLogger({
    defaultMeta: {
      logContext: EXAMPLE_NOTIFICATION_JOB_NAME,
    },
  });

  constructor(private readonly service: ExampleNotificationService) {}

  async perform(data: ExampleNotificationDataJob, job: { attemptsCount: number }) {
    this.logger.info("Processing", {
      workflowKey: data.workflowKey,
    });

    try {
      const result = await this.service.sendNotification({
        ...data,
        // Include the job's attempts count for debugging, this is called `retryAttempts` in `background-jobs-postgres`.
        attempt: job.attemptsCount + 1,
      });

      if (isFailure(result)) {
        throw result.error;
      }

      this.logger.info("Success", {
        workflowKey: data.workflowKey,
      });
    } catch (error) {
      this.logger.error("Failure", { error, data });
      throw error;
    }
  }
}
