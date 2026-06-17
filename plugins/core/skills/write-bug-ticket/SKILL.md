---
name: write-bug-ticket
description: Use when creating a Linear bug report ticket from conversation context, investigation findings, or user-provided evidence — when evidence already exists and needs structuring, not investigating.
---

# Write Bug Ticket

Structure and write Linear bug reports from evidence that already exists in the conversation. Never diagnose root cause or propose fixes. Never investigate — that's `investigate-ticket`'s job.

> **No evidence yet?** If the conversation lacks Datadog links, error details, or clear symptom descriptions, STOP and redirect to `investigate-ticket` first. It will hand off back here with structured findings.
>
> **Already investigated?** If the conversation contains investigation findings (Datadog links, code paths, Snowflake queries, flag state), use them directly — don't re-investigate.

## Process

1. **Gather context** — collect evidence from the conversation: investigation findings, user reports, Datadog links, error details
2. **Clarify (conditional)** — if missing: (a) expected behavior, (b) actual behavior, or (c) who's affected — ask before drafting. NEVER invent answers. Up to 3 rounds.
3. **Draft** — title + description, structure scaled to complexity (see format below)
4. **Self-review** — check every Red Flag below before presenting
5. **Present for review** — show ONLY the draft and metadata suggestions. Ask for team/assignee.
6. **Resolve labels** — always include the `bug` type label, plus any relevant team labels (see Labels below).
7. **Create in Linear** — only after explicit approval. Apply the resolved labels.

## Hard Rules

- **Symptom-first, diagnosis-never.** NEVER propose a fix, root cause, or investigation steps. Technical context is fine — speculation is not.
- **Evidence belongs in the ticket, but gathering it does not.** Include Datadog links, Snowflake findings, and flag state from the conversation. If none exist, redirect to `investigate-ticket` — don't search yourself.
- **STR preferred, not required.** If not reproduced: "Not yet reproduced manually. Observed via monitoring." NEVER invent STR.
- **Clean titles.** No bracket prefixes. Describe the symptom. Under 70 characters.
- **Always document the repository.** Flag multi-repo bugs to the user for splitting.
- **Approval required.** Always present the draft for user review first. Only create the ticket in Linear after the user explicitly approves.
- **Always label by type.** Every bug ticket carries the `bug` type label (or the team's closest equivalent — never invent or create a label without the user's say-so). Also suggest relevant team labels for approval. See Labels.
- **Redirect non-bugs.** Features → `write-feature-ticket`, tech debt → `write-tech-debt-ticket`.

## Ticket Format

**Title:** Describes the SYMPTOM, not the cause. Under 70 characters. No bracket prefixes.

**Repository:** Always include the repository name in the ticket body. Run `git remote get-url origin | sed 's/\.git$//' | sed 's/.*[:/]\([^/]*\/[^/]*\)$/\1/'` to get the `org/repo` name. For simple bugs, include as a bold inline label. For complex bugs, include in `## Technical Context`.

**Discovery context (optional):** If the bug was found while working on a ticket or PR, add a one-liner so reviewers understand how it surfaced (e.g., "Discovered while working on [TICKET-123](link)."). Place it after the opening paragraph for simple bugs, or in `## Technical Context` for complex bugs.

**Simple bug** (<4 details): A paragraph with bold inline labels (**Expected:**, **Actual:**, **Repository:**, etc.). No `##` headers needed.

**Complex bug** (multi-service, intermittent, wide impact): Use `## Expected Behavior`, `## Actual Behavior`, `## Steps to Reproduce`, `## Evidence`, `## Technical Context` (include repository — observables only, NOT diagnosis), `## Impact`.

**Metadata:** Priority, labels (`bug` type label + approved relevant labels, see Labels), presented BELOW the body. Always ask for team/assignee.

See reference.md for full examples.

## Labels

Every ticket gets its type label plus any relevant team labels. Labels are presented in the metadata block and applied when the user approves the ticket.

**Resolving labels requires the target team.** `list_issue_labels` is team-scoped, so confirm the team (the "Present for review" step) before resolving — suggest the type label by name up front, then resolve it against the team's actual label set once the team is known.

1. **Type label (mandatory).** Fetch the target team's labels (Linear MCP `list_issue_labels` for that team) and apply the one denoting a bug: `bug` if it exists, otherwise the closest existing equivalent (e.g. `bug-report`). Match case-insensitively and accept grouped variants. If no reasonable match exists, ask the user which label to use — NEVER invent a label or create a new one without the user's say-so.
2. **Relevant labels (suggested).** Review the team's other labels (e.g. `product-area`, area, severity) and suggest those that fit this ticket. Apply them only on approval.

## Red Flags — Self-Review Before Presenting

| Anti-Pattern                   | Fix                                                                     |
| ------------------------------ | ----------------------------------------------------------------------- |
| Root cause diagnosis           | Remove — describe symptom and evidence only                             |
| Proposed fix                   | Remove entirely                                                         |
| Investigation runbook          | Remove — this is a bug report, not an investigation plan                |
| Vague actual behavior          | Be specific: "Returns 500 error when..."                                |
| Missing expected behavior      | Add what should happen                                                  |
| Raw logs pasted inline         | Replace with Datadog log query link                                     |
| No evidence in conversation    | STOP drafting — redirect to `investigate-ticket` to gather evidence     |
| Searching Datadog yourself     | This skill writes, not investigates — use existing evidence or redirect |
| Diagnosis disguised as context | Rewrite as observable: "Cache misses increased 3x after deploy"         |
| STR invented from assumptions  | "Not yet reproduced. Observed via monitoring."                          |
| Guessed team assignment        | Ask the user — never guess                                              |
| Bracket title prefixes         | Describe the symptom without brackets                                   |
| Missing repository             | Include repo name in ticket body — derive from git remote               |
| No `bug` type label            | Always apply it (or the team's closest equivalent)                      |
