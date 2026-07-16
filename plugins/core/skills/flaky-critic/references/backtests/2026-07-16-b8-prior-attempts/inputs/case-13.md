# Historical plan snapshot

## Flaky Test Report

The following E2E test in `[admin frontend]` is among the **top 10 flakiest tests** (last 30 days) on the [Datadog Flaky Tests Management]([external evidence reference]) dashboard. Owned by **Synapse**.

### Affected Tests

| \#  | Test                                                                                                             | Failures (30d) | File                               | Repo                                              |
| --- | ---------------------------------------------------------------------------------------------------------------- | -------------- | ---------------------------------- | ------------------------------------------------- |
| 1   | `Daily View — Admin User should navigate to daily view, display shifts, interact with filters and shift details` | 6              | `playwright/e2e/dailyView.spec.ts` | [[admin frontend]]([external evidence reference]) |

### Datadog Links

- [Flaky Tests Dashboard]([external evidence reference])

### Context

This test exercises the Daily View page for an Admin User — navigating to it, verifying shifts are displayed, and interacting with filters and shift details. Previous investigations ([ticket redacted], [ticket redacted]) canonical earlier occurrences, but the test continues to flake.

### Recommended Next Steps

1. Check Datadog CI test traces for the specific failure error messages
2. Compare with previous fix in [ticket redacted] to see if the same root cause has regressed
3. Investigate filter interaction timing or data loading race conditions
