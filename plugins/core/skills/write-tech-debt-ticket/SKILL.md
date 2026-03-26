---
name: write-tech-debt-ticket
description: Use when creating a Linear tech debt ticket from code review, PR comments, codebase audits, conversations, or post-incident findings. Guides through classification, evidence gathering, and impact justification before drafting.
---

# Write Tech Debt Ticket

Draft Linear tech debt tickets that justify _why_ the debt matters — what it costs to carry, what risks it poses, and what happens if left unaddressed. Every claim backed by code references and data.

**A tech debt ticket is NOT a refactoring task.** It documents the _case_ for prioritization. The reader should understand the cost of inaction, not receive a how-to guide for fixing it.

## Process

> **Investigation first?** If the debt isn't well-understood yet (vague complaint, unclear cost, uncertain scope), use the `investigate-ticket` skill first. It will hand off back here with structured findings.
>
> **Already investigated?** If the conversation already contains investigation findings (code path traces, git history analysis, Datadog links), treat that as sufficient context — don't re-ask for information that's already been established.

1. **Gather context** — from code, PR comment, conversation, or audit
2. **Analyze the code** — read the actual code. Understand what it does and why it qualifies as debt.
3. **Classify** — pick a primary debt type (and optional secondary) from the classification table
4. **Gather evidence** (driven by classification):
   - Performance/Scalability/Reliability → search Datadog proactively (metrics, APM traces, monitors, error rates). This is NOT optional for these types.
   - Maintainability/DX → run `git log` for change frequency and bug-fix commits, grep for workarounds
   - Security → check dependency versions, scan for known vulnerability patterns
5. **Assess interest & risk** — using evidence from step 4, produce structured ratings (see below)
6. **Check for duplicates** — search Linear for existing tickets describing the same debt
7. **Draft** — title + description, structure scaled to complexity (see format below)
8. **Self-review** — check every item in the Red Flags table before presenting
9. **Present for review** — show ONLY the draft ticket and metadata suggestions. Ask for team/assignee.
10. **Create in Linear** — only after the user explicitly approves

## Debt Classification

| Type                     | Description                                          | Evidence to Gather                               |
| ------------------------ | ---------------------------------------------------- | ------------------------------------------------ |
| **Performance**          | Slow queries, inefficient algorithms, resource waste | Datadog: latency, throughput, APM traces         |
| **Maintainability**      | Hard to understand, modify, or extend                | Git log: change frequency, bug-fix ratio         |
| **Reliability**          | Fragile code likely to cause incidents               | Datadog: error rates, monitors, incident history |
| **Security**             | Vulnerabilities, outdated deps, improper access      | CVE data, dependency versions                    |
| **Developer Experience** | Slow builds, painful local dev, confusing APIs       | Build times, developer friction points           |
| **Scalability**          | Works now, won't at 2-5x load                        | Datadog: resource utilization trends             |

## Interest & Risk

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

## Hard Rules

- **This is a debt ticket, not a refactoring task.** The purpose is to document the cost of carrying the debt and make the case for prioritization. It is NOT an implementation plan. Do not write a ticket that reads like "here's how to fix this."
- **NEVER include "Proposed Solution", "Suggested Fix", "Acceptance Criteria", or implementation steps.** These turn the ticket into a task assignment. The implementer decides how to fix it. You may describe the _ideal state_ (what the code should look like) but NOT the steps to get there.
- **"Impact If Left Unaddressed" is MANDATORY.** This is the entire point of the ticket — making the business case. What happens in 3-6 months if nobody fixes this? Without this section, the ticket is just a complaint.
- **Always read the code.** Never file a ticket based on vibes. Every claim backed by a code reference or data.
- **Justify every rating.** Cite git history, Datadog data, or workaround examples. No unsupported assertions.
- **Datadog is mandatory for Performance/Reliability/Scalability debt.** Not optional. Search proactively. If no relevant data is found, note "No relevant monitoring data found" and proceed.
- **Datadog is conditional for other types.** Don't force it for maintainability or DX debt.
- **Code references always.** Every ticket must include file paths and line numbers.
- **Draft first, create second.** Present draft for user review. Create in Linear only after explicit approval.
- **Always ask for team/assignee.** Never guess.
- **Tech debt only.** Redirect bugs to `write-bug-ticket`, features to `write-feature-ticket`.
- **Clean titles.** No bracket prefixes like `[TECH DEBT]` or `[Perf]`. Describe the debt.
- **Always document the repository.** Every ticket must specify which repo contains the debt. If the debt spans multiple repos, flag this to the user — it likely needs to be split into separate tickets, one per repo.

## Ticket Format

**Title:** Describes the debt, not the fix. Under 70 characters. No bracket prefixes.

**Simple debt** (single location, clear impact): A paragraph explaining what the debt is, why it's debt, and what it costs. Classification, code references, and "Impact If Left Unaddressed" inline.

**Complex debt** (multi-file, systemic, or high-stakes):

- `## What Is The Debt` — what exists today and why it's a problem. Explain the mechanics of why this is costly — not just "this is bad."
- `## Debt Classification` — type, interest rating with justification, applicable risk dimensions with justifications
- `## Code References` — file paths with line numbers, brief annotation of what each reference shows
- `## Evidence` — Datadog links with summary stats (performance/reliability/scalability), git stats, workaround examples. Only include evidence that was actually found — don't list searches that returned nothing.
- `## Ideal State` — what the code _should_ look like or how it should behave. Before/after snippets if the ideal is obvious, prose description otherwise. This is NOT implementation steps — it's the destination, not the route.
- `## Suggested Approach` (optional) — only when the fix is well-understood AND the user has context the implementer wouldn't. Omit when ambiguous. Keep brief — 2-3 sentences max, not a numbered plan.
- `## Impact If Left Unaddressed` — what happens in 3-6 months if this isn't fixed. The business case for prioritization. Be concrete: "latency will reach Xs at projected growth", "each new notification type will require changes in N places."

**Metadata:** Priority, labels, and suggestions presented BELOW the ticket body. Separate from the description. Always apply the `technical-debt` label if available on the team.

## Red Flags — Self-Review Before Presenting

| Anti-Pattern                          | Example                                      | Fix                                                      |
| ------------------------------------- | -------------------------------------------- | -------------------------------------------------------- |
| **Reads like a refactoring task**     | "Replace X with Y, then update Z"            | Rewrite to document the cost of the debt, not the fix    |
| **Has "Proposed Solution" section**   | Numbered implementation steps                | Delete. Describe ideal state instead.                    |
| **Has "Acceptance Criteria"**         | Checklist of implementation outcomes         | Delete. This is a debt ticket, not a task.               |
| **No code references**                | "The booking service has tech debt"          | Add specific file paths and line numbers                 |
| **Unjustified ratings**               | "High interest" with no evidence             | Cite git frequency, Datadog data, or workaround examples |
| **Aesthetic complaints as debt**      | "This code is ugly" / "Not idiomatic"        | Explain the concrete cost or don't file the ticket       |
| **Missing "why it's debt"**           | Lists what the code does without the cost    | Explain what carrying this debt costs                    |
| **Vague ideal state**                 | "Should be refactored"                       | Describe what the code should look like                  |
| **No "Impact If Left Unaddressed"**   | Missing the business case                    | Always include — this gets the ticket prioritized        |
| **No Datadog for perf/reliability**   | Performance ticket with zero monitoring data | You MUST search Datadog for these types                  |
| **Forced Datadog on maintainability** | Datadog links on a maintainability ticket    | Only for performance/reliability/scalability             |
| **Guessed team assignment**           | "Team: Backend"                              | Ask the user                                             |
| **Raw data dumps inline**             | 40 lines of Datadog output                   | Link to queries, summarize key numbers                   |

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
