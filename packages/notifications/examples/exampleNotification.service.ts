// packages/notifications/src/lib/notificationClient.ts,packages/notifications/README.md
import { type NotificationClient } from "@clipboard-health/notifications";

import { type ExampleNotificationJobData } from "./exampleNotification.job";

type ExampleNotificationDo = ExampleNotificationJobData & { attempt: number };

export class ExampleNotificationService {
  constructor(private readonly client: NotificationClient) {}

  async sendNotification(params: ExampleNotificationDo) {
    const { attempt, expiresAt, idempotencyKey, recipients, workflowKey, workplaceId } = params;

    // Assume this comes from a database and, for example, are used as template variables...
    const data = { favoriteColor: "blue", secret: "2" };

    return await this.client.trigger({
      attempt,
      body: {
        recipients,
        data,
        workplaceId,
      },
      expiresAt: new Date(expiresAt),
      idempotencyKey,
      key: workflowKey,
      keysToRedact: ["secret"],
      workflowKey,
    });
  }
}
