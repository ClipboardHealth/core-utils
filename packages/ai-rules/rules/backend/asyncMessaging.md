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
- Implement idempotency (use an idempotency/unique key when duplication must be prevented)
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

**Consumer:** Assign each consumer its own dedicated SQS queue in a separate process from the API server; consumers must be idempotent and deduplicate using producer-provided message IDs via `@clipboard-health/message-consumer`'s `idempotencyKey` utility; for batch handlers, return a list of successfully processed messages instead of throwing to fail the entire batch.

**Dead-Letter Queues:** Configure a DLQ for every SQS queue with 14-day retention; do not auto-consume DLQ messages — retain until root cause is fixed, then replay.

If a design depends on strict message ordering, consult #eng-staff-plus before proceeding.
