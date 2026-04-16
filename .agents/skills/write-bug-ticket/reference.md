# Bug Ticket Reference

## Examples

### What NOT to Write

> **Title:** [BUG] 500 errors spiking on timesheet approval endpoint
>
> ### Investigation Notes
>
> - [ ] Pull error logs and stack traces from Datadog
> - [ ] Check for recent deployments prior to 14:00 UTC
> - [ ] Check downstream dependencies (DB, auth service)
> - [ ] Determine if affecting all requests or a subset
>
> **Team:** Backend / API

This diagnoses ("check downstream dependencies"), includes an investigation runbook, guesses the team, and uses a bracket prefix. A bug ticket reports symptoms and evidence — it doesn't tell the investigator how to investigate.

### Simple Bug

**Title:** Shift booking confirmation spinner hangs indefinitely on mobile

Nurses on the mobile app are unable to complete shift bookings. After submitting a booking, the confirmation screen displays an infinite spinner and never resolves. Reported by 2 nurses in California (user IDs 12345, 67890) starting approximately 2026-03-05.

**Expected Behavior:** Confirmation screen shows success or failure within a few seconds.

**Actual Behavior:** Spinner runs indefinitely. App must be force-closed.

**Repository:** ClipboardHealth/core-utils

**Evidence:**

- [RUM: session for user 12345 showing hang](https://app.datadoghq.com/rum/...)
- [Logs: timeout errors on booking confirmation endpoint (last 7d)](https://app.datadoghq.com/logs?query=...)

Suggested metadata: Priority: High

### Monitoring-Surfaced Bug

**Title:** Elevated 500 errors on timesheet approval endpoint since 14:00 UTC

## Expected Behavior

Timesheet approval requests complete successfully.

## Actual Behavior

~8% of requests returning 500 errors since 14:00 UTC on 2026-03-12. Error rate is 5x baseline.

## Steps to Reproduce

Not yet reproduced manually. Observed via monitoring.

## Evidence

- [Logs: 500 errors on /api/timesheets/approve (last 4h)](https://app.datadoghq.com/logs?query=...)
- [APM: error trace sample](https://app.datadoghq.com/apm/traces/...)
- [Monitor: timesheet-approval-error-rate (alerting)](https://app.datadoghq.com/monitors/...)

## Technical Context

**Repository:** ClipboardHealth/core-utils

Errors began at 2026-03-12 14:00 UTC. Error logs reference `MongoServerError: connection pool exhausted`. Correlates with deploy at 13:45 UTC.

## Impact

Users unable to approve timesheets. ~300 failed requests in 4 hours.

Suggested metadata: Priority: Urgent
