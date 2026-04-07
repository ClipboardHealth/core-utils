# Tech Debt Ticket Reference

## Debt Classification

| Type                     | Description                                          | Evidence to Gather                               |
| ------------------------ | ---------------------------------------------------- | ------------------------------------------------ |
| **Performance**          | Slow queries, inefficient algorithms, resource waste | Datadog: latency, throughput, APM traces         |
| **Maintainability**      | Hard to understand, modify, or extend                | Git log: change frequency, bug-fix ratio         |
| **Reliability**          | Fragile code likely to cause incidents               | Datadog: error rates, monitors, incident history |
| **Security**             | Vulnerabilities, outdated deps, improper access      | CVE data, dependency versions                    |
| **Developer Experience** | Slow builds, painful local dev, confusing APIs       | Build times, developer friction points           |
| **Scalability**          | Works now, won't at 2-5x load                        | Datadog: resource utilization trends             |

## Interest & Risk Ratings

**Every rating MUST have a justification with evidence. "High interest" without data is opinion, not analysis.**

### Interest (ongoing cost of carrying the debt)

| Rating     | Meaning                                                                                            | Evidence Required                                                                     |
| ---------- | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| **High**   | Actively slowing development or degrading production. Compounding — more code builds on top of it. | Git: high change frequency. Grep: workarounds elsewhere. Datadog: active degradation. |
| **Medium** | Regular friction but not a daily blocker. Cost is real but stable.                                 | Git: moderate change frequency. Some known workarounds.                               |
| **Low**    | Rarely encountered. Low-traffic area of the codebase.                                              | Git: few recent changes. No workarounds needed.                                       |

### Risk (three independent dimensions, include only those that apply)

- **Incident Risk** — Could this cause a production incident? Cite Datadog data when available.
- **Velocity Risk** — Is this blocking or slowing future work? Cite concrete examples.
- **Remediation Risk** — How dangerous is the fix? Large blast radius, migration needed, many consumers?

Each: High/Medium/Low with a one-line justification backed by evidence.

## Examples

### Simple Tech Debt Ticket

**Title:** Shift matching query scans full collection on every request

The shift matching query in `src/services/booking/shiftMatcher.ts:142` executes `find({ facility, status: 'open' })` without an index on the `facility` field. Every matching request scans ~200k documents instead of the ~50 that match.

**Type:** Performance | **Interest:** High — 847 requests/day hit this path. p99 latency is 4.2s vs ~120ms baseline for indexed queries ([APM: shift matching latency](https://app.datadoghq.com/apm/...)). **Incident Risk:** Medium — a traffic spike during peak booking could exhaust the connection pool. **Velocity Risk:** Low — code is stable, rarely modified.

**Ideal State:** Queries on this collection should use a compound index on the fields used in every query, reducing scan from ~200k to ~50 documents.

**Evidence:** [APM: shift matching p99 (30d)](https://app.datadoghq.com/apm/...) | [MongoDB scan metrics](https://app.datadoghq.com/dashboard/...)

**Impact If Left Unaddressed:** Latency grows linearly with shift volume. At projected 2x growth in 6 months, p99 reaches ~8s — likely triggering timeouts and booking failures during peak hours.

Suggested metadata: Priority: High

### Complex Tech Debt Ticket

**Title:** Notification dispatch logic duplicated across four cron jobs

#### What Is The Debt

Four cron jobs (`DailyDigestCron`, `ShiftReminderCron`, `CredentialExpiryCron`, `TimesheetReminderCron`) each implement their own notification dispatch: recipient resolution, template selection, channel routing, and retry handling. The implementations are nearly identical but have diverged — each has different retry behavior and error handling, making it impossible to reason about notification reliability as a whole.

#### Classification

- **Type:** Maintainability (primary), Reliability (secondary)
- **Interest:** High — 11 commits across these 4 files in the last 90 days, 6 were bug fixes. Each fix required checking whether the same bug existed in the other three. Two workaround functions exist in `src/services/notifications/helpers.ts` solely to normalize behavior.
- **Velocity Risk:** High — adding a new notification channel requires changes in 4 places with 4 different patterns.
- **Remediation Risk:** Medium — notification dispatch affects all outbound communications; requires careful rollout.

#### Code References

- `src/crons/dailyDigest.ts:87-134` — inline dispatch, 3 retries, no backoff
- `src/crons/shiftReminder.ts:62-98` — inline dispatch, 5 retries, exponential backoff
- `src/crons/credentialExpiry.ts:45-91` — inline dispatch, no retry
- `src/crons/timesheetReminder.ts:71-115` — inline dispatch, 3 retries, linear backoff
- `src/services/notifications/helpers.ts:12-34` — workaround functions for channel routing divergence

#### Evidence

- Git: 11 commits in 90 days, 6 bug fixes (each requiring 4-file audit)
- Grep: 2 workaround functions in `helpers.ts` exist solely because of the divergence

#### Ideal State

A single notification dispatch service handles recipient resolution, template selection, channel routing, and retry. Each cron job passes a notification type and recipient criteria. Retry policy is configurable per type but implemented once.

#### Impact If Left Unaddressed

Every new notification type or channel requires duplicating logic in 4 places. Bug fixes remain whack-a-mole — every fix is 4x the work and still risks inconsistency. At current rate (~2 notification bugs/month), engineering cost compounds and reliability divergence widens.

Suggested metadata: Priority: Medium | Labels: tech-debt, notifications
