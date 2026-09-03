---
description: "Working with queues, async messaging, or background jobs"
---

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

- Pass minimal, serializable arguments (IDs, not objects); take care with Dates and classes since arguments are written to a database and read back out
- Fetch fresh data in handler
- Implement idempotency (use an idempotency/unique key when duplication must be prevented). Delivery is at-least-once so a handler that enqueues a job on each invocation can double-enqueue. For a `@clipboard-health/mongo-jobs` job, prefer the library's native `unique` key over a hand-rolled ledger; it bars both a duplicate enqueue and a concurrent run:

  ```ts
  await jobs.enqueue<SubmitPayload>(
    SUBMIT_JOB,
    { shiftId },
    {
      unique: `shift-fill-submission:${shiftId}`, // key on a field every path carries
    },
  );
  ```

- Check state before action; return a descriptive skip-reason string for non-retryable conditions; throw only for retryable errors
- Use Expand/Contract for job code updates
- Keep jobs short-lived (under 15 minutes for Postgres, under 10 minutes for Mongo); split longer work into multiple jobs

**File Organization:**

- Name job handler files `<class-name>.job.ts` and place them near their owning module (not centralized into `src/jobs`)
- Migration jobs must live in `src/migrations/jobs`, be registered in `src/backgroundJobs/registerJobs`, keep batch sizes small, and be retry-safe

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

- Use `@clipboard-health/message-producer`, `@clipboard-health/message-consumer`, `terraform-aws-event-bridge` module for async messaging; do not build custom frameworks
- Each publishing microservice has its own EventBridge event bus; each message type has a single producing microservice
- For a complete, copy-ready producer + consumer (schema, publish job, consumer, handler, module wiring, and the infra checklist), see [`asyncMessaging.example.md`](./asyncMessaging.example.md)

**Producer:** Publish atomically with database writes using an outbox background job enqueued inside the same transaction; use deterministic message IDs so retries publish the same ID; include clock skew-resistant time or order information in published messages. Build the message schema from the shared branded id/timestamp schemas, and serialize Mongo values to primitives at the emit site (ObjectId→string, Date→ISO) since the payload is serialized and re-validated on the way out.

**Consumer:** Assign each consumer its own dedicated SQS queue in a separate process from the API server; consumers must be idempotent and deduplicate using producer-provided message IDs via `@clipboard-health/message-consumer`'s `idempotencyKey` utility; for batch handlers, return a list of successfully processed messages instead of throwing to fail the entire batch.

**Dead-Letter Queues:** Configure a DLQ for every SQS queue with 14-day retention; do not auto-consume DLQ messages — retain until root cause is fixed, then replay.

## Idempotency: match the strategy to the write

Consumers and jobs run at least once, so every handler must tolerate replay. Don't reach for a dedupe ledger by default — pick the cheapest strategy that survives replay for your handler's write shape:

| Handler write shape                      | Idempotent alone? | Strategy                                             |
| ---------------------------------------- | ----------------- | ---------------------------------------------------- |
| Absolute `$set` recompute-from-DB        | Yes               | Nothing — re-applying converges                      |
| Re-read + rebuild/reconcile under a lock | Yes               | Nothing — keyed on the entity, converges             |
| Delta / counter (`$inc`, array append)   | **No**            | Dedupe on the producer message ID (`idempotencyKey`) |
| Enqueue a downstream job                 | n/a               | `mongo-jobs` `unique` key                            |

The counter case is the trap: a business key like `(shiftId, type)` looks unique but legitimately repeats (assign → unassign → reassign), so it can't dedupe — dedupe on the producer-provided message ID instead.

If a design depends on strict message ordering, consult #eng-staff-plus before proceeding.
