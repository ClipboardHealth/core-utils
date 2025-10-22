// embedex: packages/notifications/src/lib/notificationClient.ts,packages/notifications/examples/usage.md
import { type NotificationClient } from "@clipboard-health/notifications";

import { type ExampleNotificationData } from "./exampleNotification.job";

type ExampleNotificationDo = ExampleNotificationData["Job"] & { attempt: number };

export class ExampleNotificationService {
  constructor(private readonly client: NotificationClient) {}

  async sendNotification(params: ExampleNotificationDo) {
    const { attempt, expiresAt, idempotencyKey, recipients, workflowKey, workplaceId } = params;

    // Assume this comes from a database and are used as template variables...
    // Use @clipboard-health/date-time's formatShortDateTime in your service for consistency.
    const data = { favoriteColor: "blue", favoriteAt: new Date().toISOString(), secret: "2" };

    // Important: Read the TypeDoc documentation for additional context.
    return await this.client.trigger({
      attempt,
      body: {
        data,
        recipients,
        workplaceId,
      },
      expiresAt: new Date(expiresAt),
      idempotencyKey,
      keysToRedact: ["secret"],
      workflowKey,
    });
  }
}
