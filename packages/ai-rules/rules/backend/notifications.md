# Notifications

Send via [Knock](https://docs.knock.app) using `@clipboard-health/notifications`. Braze is deprecated.

Trigger every Knock workflow via API (not Segment event triggers); trigger from background jobs using a single-writer pattern (one code location per notification).

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

## Push Notifications

- Include `link` in push notification data payload for deep and external links
- Include `$trigger_data` for per-recipient custom payloads

## Workflow Design

Implement branching/conditional logic in application code rather than Knock workflow function steps, unless logic depends on delivery of a prior notification.
