---
name: investigate-ticket
description: Use when investigating a bug, incident, or issue before implementation. Researches codebase, queries Datadog, and updates the Linear ticket with findings. Also use when asked to "look into" or "investigate" something.
---

# Investigate Ticket

Research-only workflow for understanding bugs, incidents, or issues before any implementation begins. Produces a structured summary with evidence, then hands off to ticket creation or update.

**This is NOT an implementation skill.** No code changes, no fixes, no PRs. Investigation only.

## Process

1. **Gather context** — accept a ticket ID/URL, Slack thread, Datadog alert, or verbal description. If a Linear ticket exists, fetch it for current details.
2. **Search Datadog** — proactively search logs, APM traces, errors, monitors, and RUM sessions for relevant signals. Use whatever clues are available: error messages, user IDs, timeframes, service names, endpoint paths. If no relevant data is found, note it and proceed.
3. **Trace the code** — find the relevant code paths in the current repo. Follow the execution flow. Identify where the problem occurs or where a gap exists. Include file paths and line numbers.
4. **Cross-reference** — check git history for recent changes to affected files. Look for related tickets in Linear. Check if the issue correlates with a deploy.
5. **Summarize findings** — present a structured summary to the user (see format below).
6. **Hand off** — ask the user what to do next (see Handoff Options below).

## Findings Format

```markdown
## Investigation: <brief description>

### What Was Found

<2-3 paragraph summary of the issue, with specific details>

### Affected Code Paths

- `<file>:<lines>` — <what this code does and why it's relevant>
- `<file>:<lines>` — <what this code does and why it's relevant>

### Evidence

- [<description>](<Datadog link>) — <summary stat>
- [<description>](<Datadog link>) — <summary stat>
- Git: <relevant commit/deploy info>

### Root Cause (if identified)

<Concrete explanation backed by evidence. If not identified, say "Root cause not yet determined" and list what was ruled out.>

### Impact

<Who is affected, how many, severity>
```

## Handoff Options

After presenting findings, ask:

```text
What would you like to do with these findings?

1. Update an existing Linear ticket with this investigation
2. Create a new ticket (I'll use the appropriate ticket skill)
3. Start implementing a fix (I'll use work-linear-ticket)
4. Just keep the findings — no ticket action needed
```

- **Option 1:** Update the ticket description with findings. Preserve existing content, add investigation section.
- **Option 2:** Redirect to `write-bug-ticket`, `write-tech-debt-ticket`, or `write-feature-ticket` as appropriate, carrying the investigation context forward.
- **Option 3:** Redirect to `work-linear-ticket`, carrying the investigation context forward.
- **Option 4:** Done. No further action.

## Hard Rules

1. **Always search Datadog** before concluding the investigation. Not optional, even if the user didn't mention monitoring.
2. **Always include code file paths and line numbers.** Vague references like "the booking service" are not acceptable.
3. **NEVER start implementing fixes** during investigation. This is research only. If you find yourself writing production code, STOP.
4. **Present findings before any ticket action.** The user decides what to do with the findings, not you.
5. **Don't invent root causes.** If you can't determine root cause from evidence, say so. Speculation presented as fact wastes the investigator's time.
6. **Carry context forward.** When handing off to a ticket skill, pass all investigation findings so the ticket skill doesn't re-ask for information you already gathered.

## Red Flags — STOP If You Notice These

| You're about to...                                    | STOP and...                                                   |
| ----------------------------------------------------- | ------------------------------------------------------------- |
| Write a fix for the bug you found                     | This is investigation only — present findings first           |
| Skip Datadog because "I already understand the issue" | Search Datadog anyway — you might find something unexpected   |
| Present vague findings without file paths             | Go back and trace the actual code paths                       |
| Create a ticket without presenting findings first     | Show the user what you found and let them decide              |
| Guess the root cause without evidence                 | Say "root cause not yet determined" and list what you checked |

## Cross-Referenced Skills

- `write-bug-ticket` — for creating bug tickets from investigation findings
- `write-tech-debt-ticket` — for creating tech debt tickets from investigation findings
- `write-feature-ticket` — for creating feature tickets from investigation findings
- `work-linear-ticket` — for implementing after investigation is complete
