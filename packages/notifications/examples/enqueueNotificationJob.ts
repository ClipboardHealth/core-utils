// packages/notifications/src/lib/notificationJobEnqueuer.ts,packages/notifications/README.md
import {
  type ExampleNotificationEnqueueData,
  ExampleNotificationJob,
} from "./exampleNotification.job";
import { notificationJobEnqueuer } from "./notificationJobEnqueuer";

async function enqueueNotificationJob() {
  await notificationJobEnqueuer.enqueueOneOrMore<ExampleNotificationEnqueueData>(
    ExampleNotificationJob,
    {
      // Set expiresAt at enqueue-time so it remains stable across job retries.
      expiresAt: minutesFromNow(60).toISOString(),
      // Set idempotencyKey at enqueue-time so it remains stable across job retries.
      idempotencyKey: {
        resourceId: "event-123",
      },
      // Set recipients at enqueue-time so they respect our notification provider's limits.
      recipients: ["user-1"],

      workflowKey: "event-starting-reminder",

      // Any additional enqueue-time data passed to the job:
      workplaceId: "workplace-123",
    },
  );
}

// eslint-disable-next-line unicorn/prefer-top-level-await
void enqueueNotificationJob();

function minutesFromNow(minutes: number) {
  return new Date(Date.now() + minutes * 60_000);
}
