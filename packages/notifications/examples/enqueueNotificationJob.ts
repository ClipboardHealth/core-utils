// packages/notifications/src/lib/notificationTriggerJob.ts,packages/notifications/README.md
import { IdempotencyKey } from "../src";
import { ExampleNotificationJob } from "./exampleNotification.job";
import { notificationTriggerJob } from "./notificationTriggerJob";

async function enqueueNotificationJob() {
  await notificationTriggerJob.enqueueOneOrMore(ExampleNotificationJob, {
    // Set expiresAt at enqueue-time so it remains stable across job retries.
    expiresAt: minutesFromNow(60),
    // Set idempotencyKey at enqueue-time so it remains stable across job retries.
    idempotencyKey: new IdempotencyKey({
      resourceId: "event-123",
    }),
    // Set recipients at enqueue-time so they respect our notification provider's limits.
    recipients: ["user-1"],

    workflowKey: "event-starting-reminder",

    // Any additional enqueue-time data passed to the job:
    workplaceId: "workplace-123",
  });
}

// eslint-disable-next-line unicorn/prefer-top-level-await
void enqueueNotificationJob();

function minutesFromNow(minutes: number) {
  return new Date(Date.now() + minutes * 60_000);
}
