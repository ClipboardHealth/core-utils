# Service Tests (Primary Testing Approach)

Test the public contract (REST endpoints, events) with real local dependencies (Postgres, Mongo, Redis). Fake slow/external services (Zendesk, Stripe).

```typescript
describe("Documents", () => {
  let tc: TestContext;

  describe("GET /documents", () => {
    it("returns existing documents for authenticated user", async () => {
      const authToken = await tc.auth.createUser({ role: "employee" });
      await tc.fixtures.createDocument({ name: "doc-1" });

      const response = await tc.http.get("/documents", {
        headers: { authorization: authToken },
      });

      expect(response.statusCode).toBe(200);
      expect(response.parsedBody.data).toHaveLength(1);
    });
  });
});
```

**Qualities:** One behavior per test, no shared setup, no mocking, <1 second, parallelizable.

**Testing Background Jobs:**

Don't spy on job enqueuing. Instead, run the job and assert side effects:

```typescript
// Run the job
await tc.jobs.drainQueues("shift.reminder");

// Assert side effects
const shift = await tc.http.get(`/shifts/${shiftId}`);
expect(shift.reminderSent).toBe(true);

// Or check fakes for external calls
expect(tc.fakes.notifications.requests).toHaveLength(1);
```

Side effects to assert: database changes, published messages, external HTTP requests.
