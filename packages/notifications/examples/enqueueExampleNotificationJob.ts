// embedex: packages/notifications/examples/usage.md
import { type BackgroundJobsAdapter } from "@clipboard-health/background-jobs-adapter";
import { type SerializableTriggerRequest } from "@clipboard-health/notifications";

import { BackgroundJobsService } from "./setup";
import { TRIGGER_NOTIFICATION_JOB_NAME } from "./triggerNotification.constants";
import { WORKFLOW_KEYS } from "./workflowKeys";

/**
 * Enqueue a notification job. Pass the full trigger request at enqueue time. It is immutable once
 * enqueued, eliminating issues with stale data and idempotency key conflicts that can occur when
 * looking up fresh data at job execution time.
 */
async function enqueueExampleNotificationJob(adapter: BackgroundJobsAdapter) {
  const data: SerializableTriggerRequest = {
    // Important: Read the TypeDoc documentation for additional context.
    body: {
      recipients: ["userId-1", "userId-2"],
      data: { favoriteColor: "blue" },
    },
    /*
     * Set expiresAt at enqueue-time so it remains stable across job retries. Use date-fns in your
     * service instead of this manual calculation.
     */
    expiresAt: new Date(Date.now() + 60 * 60_000).toISOString(),
    // Keys to redact from logs
    keysToRedact: ["secret"],
    workflowKey: WORKFLOW_KEYS.eventStartingReminder,
  };

  // Option 1: Use background job ID as idempotency key (most common).
  await adapter.enqueue(TRIGGER_NOTIFICATION_JOB_NAME, data);

  // Option 2: Provide your own idempotency key for background job and notification deduplication.
  await adapter.enqueue(TRIGGER_NOTIFICATION_JOB_NAME, data, {
    idempotencyKey: `meeting-123-reminder`,
  });
}

// eslint-disable-next-line unicorn/prefer-top-level-await
void enqueueExampleNotificationJob(new BackgroundJobsService());

// 1. Search your service for `triggerNotification.job.ts` and `triggerNotification.service.ts`. If they don't exist, create them:
// 2. Search the service for a constant that stores workflow keys. If there isn't one, create and export it. You MUST insert the key in alphabetical order:
// 3. Build your `SerializableTriggerRequest` and enqueue your job. Enqueue your job in the same database transaction as the changes it's notifying about:
