// embedex: packages/notifications/src/lib/notificationJobEnqueuer.ts,packages/notifications/examples/usage.md
import {
  EXAMPLE_NOTIFICATION_JOB_NAME,
  type ExampleNotificationDataEnqueue,
} from "./exampleNotification.constants";
import { notificationJobEnqueuer } from "./notificationJobEnqueuer";
import { WORKFLOW_KEYS } from "./workflowKeys";

async function enqueueNotificationJob() {
  await notificationJobEnqueuer.enqueueOneOrMore<ExampleNotificationDataEnqueue>(
    EXAMPLE_NOTIFICATION_JOB_NAME,
    // Important: Read the TypeDoc documentation for additional context.
    {
      /**
       * Set expiresAt at enqueue-time so it remains stable across job retries. Use date-fns in your
       * service instead of this manual calculation.
       */
      expiresAt: new Date(Date.now() + 60 * 60_000).toISOString(),
      // Set idempotencyKeyParts at enqueue-time so it remains stable across job retries.
      idempotencyKeyParts: {
        resource: {
          type: "account",
          id: "4e3ffeec-1426-4e54-ad28-83246f8f4e7c",
        },
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
