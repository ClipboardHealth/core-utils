# Notifications

Send via [Knock](https://docs.knock.app) using `@clipboard-health/notifications`.

Use `triggerChunked` to store full trigger request at job enqueue time. See package documentation for setup of `triggerNotification.job.ts`, `notificationClient.provider.ts`, and workflow keys.

**Job enqueue pattern:**

```typescript
const jobData: SerializableTriggerChunkedRequest = {
  body: { recipients: ["userId-1"], data: notificationData },
  expiresAt: new Date(Date.now() + 60 * 60_000).toISOString(),
  keysToRedact: ["secret"],
  workflowKey: WORKFLOW_KEYS.eventStartingReminder,
};

await adapter.enqueue(TRIGGER_NOTIFICATION_JOB_NAME, jobData, { session });
```
