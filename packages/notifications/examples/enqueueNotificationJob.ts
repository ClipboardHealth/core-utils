// embedex: packages/notifications/src/lib/notificationJobEnqueuer.tsx,packages/notifications/examples/usage.md
import {
  EXAMPLE_NOTIFICATION_JOB_NAME,
  type ExampleNotificationData,
} from "./exampleNotification.job";
import { notificationJobEnqueuer } from "./notificationJobEnqueuer";
import { WORKFLOW_KEYS } from "./workflowKeys";

async function enqueueNotificationJob() {
  await notificationJobEnqueuer.enqueueOneOrMore<ExampleNotificationData["Enqueue"]>(
    EXAMPLE_NOTIFICATION_JOB_NAME,
    // Important: Read the TypeDoc documentation for additional context.
    {
      // Set expiresAt at enqueue-time so it remains stable across job retries.
      // Use date-fns in your service instead of this manual calculation.
      expiresAt: new Date(Date.now() + 60 * 60_000).toISOString(),
      // Set idempotencyKey at enqueue-time so it remains stable across job retries.
      idempotencyKey: {
        resourceId: "event-123",
      },
      // Set recipients at enqueue-time so they respect our notification provider's limits.
      recipients: ["userId-1"],

      workflowKey: WORKFLOW_KEYS.eventStartingReminder,

      // Any additional enqueue-time data passed to the job:
      workplaceId: "workplaceId-123",
    },
  );
}

// eslint-disable-next-line unicorn/prefer-top-level-await
void enqueueNotificationJob();
