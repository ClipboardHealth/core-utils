# Async Messaging & Background Jobs

## When to Use

| Scenario                         | Solution          |
| -------------------------------- | ----------------- |
| Same service producer/consumer   | Background Jobs   |
| Cross-service communication      | EventBridge + SQS |
| Deferred work from API path      | Background Jobs   |
| Replacing `void` fire-and-forget | Background Jobs   |
| Scaling CRON jobs                | Background Jobs   |

## Background Jobs

**Creation with Transaction:**

```typescript
async function createLicense() {
  await db.transaction(async (tx) => {
    const license = await tx.license.create({ data });
    await jobs.enqueue(VerificationJob, { licenseId: license.id }, { transaction: tx });
  });
}
```

**Handler Pattern:**

```typescript
class ShiftReminderJob implements Handler<ShiftReminderPayload> {
  static queueName = "shift.reminder";

  async perform(payload: ShiftReminderPayload, job: Job): Promise<string> {
    const { shiftId } = payload;

    // Fetch fresh data—don't trust stale payload
    const shift = await this.shiftRepo.findById({ id: shiftId });

    if (!shift || shift.isCancelled) {
      return `Skipping: shift ${shiftId} not found or cancelled`;
    }

    try {
      await this.notificationService.performSideEffect(shift);
      return `Reminder sent for shift ${shiftId}`;
    } catch (error) {
      if (error instanceof KnownRecoverableError) throw error; // Retry
      return `Skipping: ${error.message}`; // No retry
    }
  }
}
```

**Key Practices:**

- Pass minimal arguments (IDs, not objects)
- Fetch fresh data in handler
- Implement idempotency
- Check state before action
- Use Expand/Contract for job code updates

**Avoid Circular Dependencies:**

```typescript
// Shared types file
export const NOTIFICATION_JOB = "shift-notification";
export interface NotificationJobPayload {
  shiftId: string;
}

// Enqueue by string name
await jobs.enqueue<NotificationJobPayload>(NOTIFICATION_JOB, { shiftId });
```

## SQS/EventBridge

**Producer:** Single producer per message type, publish atomically (use jobs as outbox), deterministic message IDs, don't rely on strict ordering.

**Consumer:** Own queue per consumer, must be idempotent, separate process from API, don't auto-consume DLQs.
