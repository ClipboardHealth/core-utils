---
description: "Writing service tests: test data, background jobs, bug handling, migrations"
---

# Service Tests (Primary Testing Approach)

Test the public contract (REST endpoints, events) with real local dependencies (Postgres, Mongo, Redis). Fake slow/external services (LaunchDarkly, Stripe, Zendesk) and other microservices with fakes; fake the event bus.

Backend test files use the `.spec.ts` suffix (not `.test.ts`) and sit next to the file they cover.

Tests drive a `TestContext` (`tc`): `tc.auth` to create authenticated users, `tc.fixtures` for setup, `tc.http` to call endpoints, `tc.jobs` to drain queues, and `tc.fakes` to assert calls to faked externals. Read responses off `response.parsedBody`, not `response.body`; for JSON:API endpoints the payload sits under `.data`.

Nest a `describe` per resource, then a `describe` per endpoint (`"GET /documents"`), then one `it` per behavior.

**Qualities:** One behavior per test, no shared setup, no mocking, <1 second, parallelizable.

## Test Data

Arrange test data via the public contract (API calls), not direct database inserts or ORM usage.

## Bug Handling

If a test reveals a critical bug, fix it before merging. If non-critical, assert current behavior with a comment documenting the bug, why it's a bug, and the owning team.

## Migration Files

Migration files that need NestJS providers must use `getFromContainer(SomeService)`.

**Testing Background Jobs:**

Don't spy on job enqueuing. Run the job with `tc.jobs.drainQueues("<queue.name>")`, then assert its side effects: database changes, published messages, and external HTTP requests (via `tc.fakes`).
