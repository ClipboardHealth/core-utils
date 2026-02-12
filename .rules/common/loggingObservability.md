# Logging & Observability

## Log Levels

| Level | When                                                        |
| ----- | ----------------------------------------------------------- |
| ERROR | Required functionality broken, worth an Incident.io page    |
| WARN  | Recovered required failure OR broken optional functionality |
| INFO  | Informative, ignorable during normal ops                    |
| DEBUG | Local only, not production                                  |

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

- **Never log:** PII, PHI, tokens, secrets, SSN, account numbers, entire request/response/headers.
- Ship all application logs to Datadog; do not log server errors in client-side code
- Use Datadog custom metrics with context tags for rates and totals instead of log-based counting:

  ```typescript
  datadogMetrics.increment("negotiation.errors", { state: "New York" });
  ```

- Log IDs or specific fields instead of full objects:
  - `workerId` (not `agent`, `hcp`, `worker`)
  - `shiftId` (not `shift`)
- When multiple log statements share context, create a reusable `logContext` object:

  ```typescript
  const logContext = { shiftId, workerId };
  logger.info("Processing shift", logContext);
  logger.info("Notification sent", logContext);
  ```

## Monitoring

- Create Datadog monitors for `background_jobs.queue.created > 0` and `background_jobs.queue.failed > 0` for every service that uses background jobs
