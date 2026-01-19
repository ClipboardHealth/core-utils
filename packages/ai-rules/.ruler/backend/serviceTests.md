# Service Tests (Primary Testing Approach)

Test the public contract (REST endpoints, events) with real local dependencies (Postgres, Mongo, Redis). Fake slow/external services (Zendesk, Stripe).

```typescript
describe("Documents", () => {
  let tc: TestContext;

  describe("GET /documents", () => {
    it("returns existing documents for authenticated user", async () => {
      // Arrange
      const authToken = await tc.auth.createUser({ role: "employee" });
      await tc.fixtures.createDocument({ name: "doc-1" });

      // Act
      const response = await tc.http.get("/documents", {
        headers: { authorization: authToken },
      });

      // Assert
      expect(response.statusCode).toBe(200);
      expect(response.parsedBody.data).toHaveLength(1);
    });
  });
});
```

**Qualities:** One behavior per test, no shared setup, no mocking, <1 second, parallelizable.
