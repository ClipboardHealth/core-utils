// packages/notifications/examples/usage.md
import { type BaseHandler } from "@clipboard-health/background-jobs-adapter";
import { type NotificationData } from "@clipboard-health/notifications";
import { isFailure, toError } from "@clipboard-health/util-ts";

import { type ExampleNotificationService } from "./exampleNotification.service";

export type ExampleNotificationData = NotificationData<{
  workplaceId: string;
}>;

export const EXAMPLE_NOTIFICATION_JOB_NAME = "ExampleNotificationJob";

// For mongo-jobs, you'll implement HandlerInterface<ExampleNotificationData["Job"]>
// For background-jobs-postgres, you'll implement Handler<ExampleNotificationData["Job"]>
export class ExampleNotificationJob implements BaseHandler<ExampleNotificationData["Job"]> {
  public name = EXAMPLE_NOTIFICATION_JOB_NAME;

  constructor(private readonly service: ExampleNotificationService) {}

  async perform(data: ExampleNotificationData["Job"], job: { attemptsCount: number }) {
    const result = await this.service.sendNotification({
      ...data,
      // Include the job's attempts count for debugging, this is called `retryAttempts` in `background-jobs-postgres`.
      attempt: job.attemptsCount + 1,
    });

    if (isFailure(result)) {
      throw toError(result.error);
    }
  }
}
