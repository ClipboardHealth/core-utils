---
description: "Adding logging, metrics, monitoring, or observability: levels, context, PII, Datadog"
---

# Logging & Observability

## Log Levels

| Level | When                                                        |
| ----- | ----------------------------------------------------------- |
| ERROR | Required functionality broken, worth an Incident.io page    |
| WARN  | Recovered required failure OR broken optional functionality |
| INFO  | Informative, ignorable during normal ops                    |
| DEBUG | Local only, not production                                  |

## Best Practices

- Pass context as a structured second argument rather than interpolating it into the message: `logger.error("Exporting urgent shifts to CSV failed", { workplaceId, startDate, endDate })`
- **Never log:** PII, PHI, tokens, secrets, SSN, account numbers, entire request/response/headers.
- Ship all application logs to Datadog; do not log server errors in client-side code
- Use Datadog custom metrics with context tags for rates and totals instead of log-based counting: `datadogMetrics.increment("negotiation.errors", { state: "New York" })`
- Log IDs or specific fields instead of full objects:
  - `workerId` (not `agent`, `hcp`, `worker`)
  - `shiftId` (not `shift`)
- When multiple log statements share context, hoist it into a reusable `logContext` object and pass that to each call

## Monitoring

- Create Datadog monitors for every service that uses background jobs: alert on sustained `background_jobs.queue.failed` (e.g., failure rate above threshold for several minutes) and on no-data for `background_jobs.queue.created` (jobs stopped being created)
