// packages/notifications/README.md
import { type BaseHandler } from "@clipboard-health/background-jobs-adapter";
import {
  type NotificationEnqueueData,
  type NotificationJobData,
} from "@clipboard-health/notifications";
import { isFailure, toError } from "@clipboard-health/util-ts";

import { type ExampleNotificationService } from "./exampleNotification.service";

interface ExampleNotificationData {
  workplaceId: string;
}

export type ExampleNotificationEnqueueData = NotificationEnqueueData & ExampleNotificationData;
export type ExampleNotificationJobData = NotificationJobData & ExampleNotificationData;

export class ExampleNotificationJob implements BaseHandler<ExampleNotificationJobData> {
  constructor(private readonly service: ExampleNotificationService) {}

  async perform(data: ExampleNotificationJobData, job: { attemptsCount: number }) {
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
