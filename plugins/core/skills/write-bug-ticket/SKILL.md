---
name: write-bug-ticket
description: Use when creating a Linear bug report ticket from user reports, customer complaints, monitoring alerts, or production investigation. Guides through evidence gathering from Datadog before drafting.
---

# Write Bug Ticket

Draft Linear bug report tickets that clearly document symptoms and provide Datadog evidence. Never diagnose root cause or propose fixes. Each ticket describes what's broken, what should happen, and links to evidence.

## Process

> **Investigation first?** If you don't have at least: (1) a clear symptom description, (2) who's affected, and (3) evidence (Datadog links, error messages, or reproduction steps) — use `investigate-ticket` first. Don't try to draft a bug ticket from a vague report. It will hand off back here with structured findings.
>
> **Already investigated?** If the conversation already contains investigation findings (Datadog links, code path traces, root cause analysis), treat that as sufficient context — don't re-ask for information that's already been established.

1. **Gather context** — assess what's known from conversation, user input, customer complaints, or ongoing investigation
2. **Search Datadog** — ALWAYS search Datadog proactively before drafting, even if the user didn't mention it. Use whatever clues are available: error messages, user IDs, timeframes, service names, endpoint paths. Search logs, RUM sessions, errors, monitors, and spans. If searches yield nothing useful, note "No relevant monitoring data found" and proceed.
3. **Check for duplicates** — search Linear for existing tickets describing the same symptom. If a match exists, surface it to the user.
4. **Clarify (conditional)** — if the input doesn't clearly answer: (a) What's the expected behavior? (b) What's the actual behavior? (c) Who/what is affected? — you MUST ask before drafting. NEVER invent or assume expected/actual behavior. Ask up to 3 rounds, one question per message. Skip only when context is genuinely sufficient.
5. **Draft** — title + description, structure scaled to complexity (see format below)
6. **Self-review** — check every item in the Red Flags table before presenting
7. **Present for review** — show ONLY the draft ticket and metadata suggestions to the user. Do not show your internal process steps (Datadog searches, self-review checklist, etc.). Always ask the user who to assign it to and which team.
8. **Create in Linear** — only after the user explicitly approves, create via Linear MCP

## Hard Rules

- **Symptom-first, diagnosis-never.** Describe what's broken. Provide evidence. NEVER propose a fix, root cause, or investigation steps. Technical context (error messages, affected services, deploy time correlations) is fine — speculation and investigation runbooks are not.
- **Datadog always, links always.** Search Datadog BEFORE drafting. Include direct links to log queries, RUM sessions, error traces, monitors, and dashboards. Summary stats (e.g., "47 occurrences in 24h") are good. Raw log dumps pasted inline are not — link instead. Only include evidence that was actually found — don't list things you searched for and didn't find.
- **STR preferred, not required.** If no one has manually reproduced it, write "Not yet reproduced manually. Observed via monitoring." with Datadog evidence links. NEVER invent STR from assumptions.
- **Draft first, create second.** Present the draft for user review. Only create in Linear after explicit user approval.
- **Always ask for team/assignee.** NEVER guess or assign a team. Ask the user.
- **Bug reports only.** Redirect feature requests to the `write-feature-ticket` skill.
- **Clean titles.** No bracket prefixes like `[BUG]`, `[Mobile]`, `[API]`. Just describe the symptom.
- **Always document the repository.** Every ticket must specify which repo the bug lives in. If investigation reveals the bug spans multiple repos, flag this to the user — it likely needs to be split into separate tickets, one per repo.

## Ticket Format

**Title:** Short, describes the SYMPTOM — not the cause. Under 70 characters. No bracket prefixes.

**Simple bug** (clear symptom, <4 details to convey): A paragraph describing what's happening, who's affected, and the impact. Bold inline labels (**Expected Behavior:**, **Actual Behavior:**, etc.) are fine, but `##` section headers aren't needed.

**Complex bug** (multi-service, intermittent, wide impact): Sections as needed:

- `## Expected Behavior`
- `## Actual Behavior` — including frequency/severity
- `## Steps to Reproduce` — or "Not yet reproduced manually. Observed via monitoring."
- `## Evidence` — Datadog links and summary stats
- `## Technical Context` (optional) — only concrete observables: "started after deploy at 14:00 UTC", "only affects service X". NOT diagnosis.
- `## Impact` — who/how many affected, severity

**Metadata:** Present priority (Urgent/High/Medium/Low/No Priority), labels, and any other suggestions BELOW the ticket body, separate from the description. Always apply the `bug` label if available on the team.

## Red Flags — Self-Review Before Presenting

| Anti-Pattern                   | Example                                                | Fix                                                             |
| ------------------------------ | ------------------------------------------------------ | --------------------------------------------------------------- |
| Root cause diagnosis           | "Caused by a race condition in..."                     | Remove — describe symptom and evidence only                     |
| Proposed fix                   | "We should add a null check..."                        | Remove entirely                                                 |
| Investigation runbook          | "Investigation Notes: [ ] Check DB, [ ] Check auth..." | Remove — this is a bug report, not an investigation plan        |
| Vague actual behavior          | "The page doesn't work"                                | Be specific: "Returns 500 error when..."                        |
| Missing expected behavior      | Only describes what's wrong                            | Add what should happen                                          |
| Raw logs pasted inline         | 50 lines of log output                                 | Replace with Datadog log query link                             |
| No Datadog evidence            | Bug report with no links                               | You must search Datadog before drafting                         |
| Diagnosis disguised as context | "The cache TTL is too short"                           | Rewrite as observable: "Cache misses increased 3x after deploy" |
| STR invented from assumptions  | "1. Go to settings 2. Click..." when untested          | "Not yet reproduced. Observed via monitoring."                  |
| Guessed team assignment        | "Team: Mobile / Shift Booking"                         | Ask the user — never guess                                      |
| Bracket title prefixes         | "[BUG] 500 errors on endpoint"                         | "Elevated 500 errors on timesheet approval endpoint"            |
| Over-structured simple bug     | 8 section headers for a 3-sentence bug                 | Use inline bold labels, not ## headers                          |

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

Errors began at 2026-03-12 14:00 UTC. Error logs reference `MongoServerError: connection pool exhausted`. Correlates with deploy at 13:45 UTC.

## Impact

Users unable to approve timesheets. ~300 failed requests in 4 hours.

Suggested metadata: Priority: Urgent
