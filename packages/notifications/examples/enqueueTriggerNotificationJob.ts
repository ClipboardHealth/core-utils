// embedex: packages/notifications/examples/usage.md
import { type BackgroundJobsAdapter } from "@clipboard-health/background-jobs-adapter";
import { type SerializableTriggerChunkedRequest } from "@clipboard-health/notifications";

import { BackgroundJobsService } from "./setup";
import { TRIGGER_NOTIFICATION_JOB_NAME } from "./triggerNotification.constants";
import { WORKFLOW_KEYS } from "./workflowKeys";

/**
 * Enqueue a notification job in the same database transaction as the changes it's notifying about.
 * The `session` option is called `transaction` in `background-jobs-postgres`.
 */
async function enqueueTriggerNotificationJob(adapter: BackgroundJobsAdapter) {
  // Assume this comes from a database and are used as template variables...
  const notificationData = {
    favoriteColor: "blue",
    // Use @clipboard-health/date-time's formatShortDateTime in your service for consistency.
    favoriteAt: new Date().toISOString(),
    secret: "2",
  };

  const jobData: SerializableTriggerChunkedRequest = {
    // Important: Read the TypeDoc documentation for additional context.
    body: {
      recipients: ["userId-1", "userId-2"],
      data: notificationData,
    },
    // Helpful when controlling notifications with feature flags.
    dryRun: false,
    // Set expiresAt at enqueue-time so it remains stable across job retries. Use date-fns in your
    // service instead of this manual calculation.
    expiresAt: new Date(Date.now() + 60 * 60_000).toISOString(),
    // Keys to redact from logs
    keysToRedact: ["secret"],
    workflowKey: WORKFLOW_KEYS.eventStartingReminder,
  };

  // Option 1 (default): Automatically use background job ID as idempotency key.
  await adapter.enqueue(TRIGGER_NOTIFICATION_JOB_NAME, jobData, { session: "..." });

  // Option 2 (advanced): Provide custom idempotency key to job and notification libraries for more
  // control. You'd use this to provide enqueue-time deduplication. For example, if you enqueue when
  // a user clicks a button and only want them to receive one notification.
  await adapter.enqueue(TRIGGER_NOTIFICATION_JOB_NAME, jobData, {
    // Called `idempotencyKey` in `background-jobs-postgres`.
    unique: `meeting-123-reminder`,
    session: "...",
  });
}

// eslint-disable-next-line unicorn/prefer-top-level-await
void enqueueTriggerNotificationJob(
  // Use your instance of `@clipboard-health/mongo-jobs` or `@clipboard-health/background-jobs-postgres` here.
  new BackgroundJobsService(),
);
