# Logging & Observability

## Log Levels

| Level | When                                       |
| ----- | ------------------------------------------ |
| ERROR | Required functionality broken (2am pager?) |
| WARN  | Optional broken OR recovered from failure  |
| INFO  | Informative, ignorable during normal ops   |
| DEBUG | Local only, not production                 |

## Best Practices

```typescript
// Bad
logger.error("Operation failed");
logger.error(`Operation failed for workplace ${workplaceId}`);

// Good—structured context
logger.error("Exporting urgent shifts to CSV failed", {
  workplaceId,
  startDate,
  endDate,
});
```

**Never log:** PII, PHI, tokens, secrets, SSN, account numbers, entire request/response/headers.

Use metrics for counting:

```typescript
datadogMetrics.increment("negotiation.errors", { state: "New York" });
```
