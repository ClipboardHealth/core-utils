# Problem Brief Format

## Template

```text
## Problem Brief

### Who is affected?
[Specific users/roles/segments — not just "users"]

### What can't they do today?
[Current pain point or missing capability — concrete, not vague]

### Why does it matter?
[Impact, urgency, business context — why this deserves a ticket]

### What we learned from research
[Key findings from investigate-ticket — Datadog data, codebase observations, Snowflake queries, usage stats, etc. If no research was needed, note "Context was sufficient from conversation."]

### Open questions / unknowns
[Anything that couldn't be answered, with context on why and suggestions for how to resolve. If none, note "No open questions."]

### Out of scope
[Anything explicitly excluded during the interview. If nothing was excluded, note "Nothing explicitly excluded."]
```

## Filled Example

> Context: User said "we need to add a toggle for the daily interview digest per workplace."

## Problem Brief

### Who is affected?

Employee admins at workplaces using phone interviews.

### What can't they do today?

They cannot disable the daily interview digest email for their workplace. The digest is sent to all workplaces regardless of whether they use video or phone interviews. Workplaces using phone interviews find the digest irrelevant to their workflow.

### Why does it matter?

Phone-interview workplaces receive daily emails with no actionable content, creating noise for employee admins. ~40% of active workplaces use phone interviews (Snowflake query on interview type distribution).

### What we learned from research

- Codebase: `DailyNotificationCronJob` sends to all workplaces unconditionally — no per-workplace filtering exists (`src/crons/dailyDigest.ts:87-134`)
- Snowflake: 847 of 2,100 active workplaces use phone interviews
- Datadog: digest emails have a 12% open rate at phone-interview workplaces vs 64% at video-interview workplaces
- No existing interview settings model supports per-workplace notification preferences

### Open questions / unknowns

- Should switching from video to phone interviews auto-disable the digest? (User confirmed: yes)
- What role should be able to toggle this? (User confirmed: employee admins only)

### Out of scope

- Per-user digest preferences (only per-workplace for now)
- Other notification types beyond the daily digest
