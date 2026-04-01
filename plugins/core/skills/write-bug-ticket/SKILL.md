---
name: write-bug-ticket
description: Use when creating a Linear bug report ticket from user reports, customer complaints, monitoring alerts, or production investigation. Guides through evidence gathering from Datadog before drafting.
---

# Write Bug Ticket

Draft Linear bug reports that document symptoms and provide Datadog evidence. Never diagnose root cause or propose fixes.

> Missing a clear symptom, who's affected, or evidence? Use `investigate-ticket` first. If the conversation already has investigation findings, use them — don't re-ask.

## Process

1. **Gather context** — assess what's known from conversation, user input, or ongoing investigation
2. **Search Datadog** — ALWAYS search proactively before drafting. If nothing found, note it and proceed.
3. **Check for duplicates** — search Linear for existing tickets with the same symptom.
4. **Clarify (conditional)** — if missing: (a) expected behavior, (b) actual behavior, or (c) who's affected — ask before drafting. NEVER invent answers. Up to 3 rounds.
5. **Draft** — title + description, structure scaled to complexity (see format below)
6. **Self-review** — check every Red Flag below before presenting
7. **Present for review** — show ONLY the draft and metadata suggestions. Ask for team/assignee.
8. **Create in Linear** — only after explicit approval

## Hard Rules

- **Symptom-first, diagnosis-never.** NEVER propose a fix, root cause, or investigation steps. Technical context is fine — speculation is not.
- **Datadog always, links always.** Include direct links, not raw log dumps. Only include evidence actually found.
- **STR preferred, not required.** If not reproduced: "Not yet reproduced manually. Observed via monitoring." NEVER invent STR.
- **Clean titles.** No bracket prefixes. Describe the symptom. Under 70 characters.
- **Always document the repository.** Flag multi-repo bugs to the user for splitting.
- **Redirect non-bugs.** Features → `write-feature-ticket`, tech debt → `write-tech-debt-ticket`.

## Ticket Format

**Title:** Describes the SYMPTOM, not the cause. Under 70 characters. No bracket prefixes.

**Simple bug** (<4 details): A paragraph with bold inline labels (**Expected:**, **Actual:**, etc.). No `##` headers needed.

**Complex bug** (multi-service, intermittent, wide impact): Use `## Expected Behavior`, `## Actual Behavior`, `## Steps to Reproduce`, `## Evidence`, `## Technical Context` (optional — observables only, NOT diagnosis), `## Impact`.

**Metadata:** Priority, labels (`bug`), presented BELOW the body. Always ask for team/assignee.

See reference.md for full examples.

## Red Flags — Self-Review Before Presenting

| Anti-Pattern                   | Fix                                                             |
| ------------------------------ | --------------------------------------------------------------- |
| Root cause diagnosis           | Remove — describe symptom and evidence only                     |
| Proposed fix                   | Remove entirely                                                 |
| Investigation runbook          | Remove — this is a bug report, not an investigation plan        |
| Vague actual behavior          | Be specific: "Returns 500 error when..."                        |
| Missing expected behavior      | Add what should happen                                          |
| Raw logs pasted inline         | Replace with Datadog log query link                             |
| No Datadog evidence            | You must search Datadog before drafting                         |
| Diagnosis disguised as context | Rewrite as observable: "Cache misses increased 3x after deploy" |
| STR invented from assumptions  | "Not yet reproduced. Observed via monitoring."                  |
| Guessed team assignment        | Ask the user — never guess                                      |
| Bracket title prefixes         | Describe the symptom without brackets                           |
