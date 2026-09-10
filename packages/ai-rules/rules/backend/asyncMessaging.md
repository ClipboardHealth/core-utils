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

Enqueue inside the same transaction as the write that triggers it, passing the transaction through (`{ transaction: tx }`), so the job is never visible without its data. A handler implements `Handler<Payload>` with a static `queueName` and a `perform` method returning a status string.

**Key Practices:**

- Pass minimal, serializable arguments (IDs, not objects); take care with Dates and classes since arguments are written to a database and read back out
- Fetch fresh data in handler
- Choose a replay-safe strategy from [Idempotency](#idempotency) for each handler
- Check state before action; return a descriptive skip-reason string for non-retryable conditions; rethrow only retryable errors (`error instanceof KnownRecoverableError`)
- Use Expand/Contract for job code updates
- Keep jobs short-lived (under 15 minutes for Postgres, under 10 minutes for Mongo); split longer work into multiple jobs

**File Organization:**

- Name job handler files `<class-name>.job.ts` and place them near their owning module (not centralized into `src/jobs`)
- Migration jobs must live in `src/migrations/jobs`, be registered in `src/backgroundJobs/registerJobs`, keep batch sizes small, and be retry-safe

**Avoid Circular Dependencies:** put the queue-name constant and payload interface in a shared types file and enqueue by string name (`jobs.enqueue<NotificationJobPayload>(NOTIFICATION_JOB, { shiftId })`) rather than importing the handler class.

## SQS/EventBridge

- Use `@clipboard-health/message-producer`, `@clipboard-health/message-consumer`, `terraform-aws-event-bridge` module for async messaging; do not build custom frameworks
- Each publishing microservice has its own EventBridge event bus; each message type has a single producing microservice

**Producer:** Publish atomically with database writes using an outbox background job enqueued inside the same transaction; use deterministic message IDs so retries publish the same ID; include clock skew-resistant time or order information in published messages.

**Message schemas:** Build branded ID schemas in the message contract from `objectId` or `uuid` in `@clipboard-health/contract-core`; validate wire timestamps with `z.string().datetime({ offset: true })`. Serialize Mongo values to primitives before publishing (ObjectId to string, Date to ISO string).

**Consumer:** Assign each consumer its own dedicated SQS queue in a separate process from the API server; choose a replay-safe strategy from [Idempotency](#idempotency) for each handler; for batch handlers, return a list of successfully processed messages instead of throwing to fail the entire batch.

**Dead-Letter Queues:** Configure a DLQ for every SQS queue with 14-day retention; do not auto-consume DLQ messages — retain until root cause is fixed, then replay.

If a design depends on strict message ordering, consult #eng-staff-plus before proceeding.

## Idempotency

Choose the simplest strategy that protects every write and side effect against duplicate delivery, concurrent execution, and replay after completion.

| Handler write shape                                                             | Strategy                                                                                                                              |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Recompute from current DB state and apply absolute `$set`, or rebuild/reconcile | Convergent writes need no message ledger. Hold an entity lock across the read and write, or reject stale writes with a version check. |
| Delta / counter (`$inc`, array append)                                          | Deduplicate by producer message identity; commit the dedupe record and DB mutation atomically.                                        |
| Enqueue a downstream job                                                        | Use `@clipboard-health/mongo-jobs`'s `unique` option to coalesce outstanding work; make the downstream effects replay-safe.           |

**Dedupe keys:** Use `@clipboard-health/message-consumer`'s `idempotencyKey({ id, source })` to distinguish replay from a new event. A business key like `(shiftId, type)` legitimately repeats (assign → unassign → reassign), so deduplicating by it drops valid events.

**Job uniqueness:** A string `unique` key, such as `shift-fill-submission:<shiftId>`, prevents another job with that key from being enqueued while the first is queued or running. Completion releases the key, so a later replay can enqueue again. Use this to coalesce interchangeable work; for distinct operations, include the operation identity in the key. Protect completed side effects with an idempotent operation or durable deduplication.
