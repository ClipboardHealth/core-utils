---
name: investigate-ticket
description: Use when investigating a bug, incident, or issue before implementation. Researches codebase, queries Datadog, and presents structured findings with handoff options. Also use when asked to "look into" or "investigate" something.
---

# Investigate Ticket

Research-only workflow — no code changes, no fixes, no PRs. Produces a structured summary with evidence, then hands off to ticket creation or the user.

## Process

1. **Gather context** — accept a ticket ID/URL, Slack thread, Datadog alert, or verbal description. If a Linear ticket exists, fetch it.
2. **Initial Datadog scan** — quick, broad search for obvious signals. The goal is orientation, not root cause. **Do not form a hypothesis yet.**
3. **Trace the full execution path** — from the entry point (controller, webhook handler, cron job), trace through **every branch, early return, and conditional** to the expected outcome. For each branch, note:
   - What condition triggers it
   - What log message it produces (exact string and structured attributes)
   - Whether a feature flag gates it (note the flag key)
     Do NOT skip branches that seem unlikely — those are where non-obvious bugs hide.
4. **Check feature flags** — if you found flags in step 3, look up each flag's current state in LaunchDarkly (see reference.md for details).
5. **Validate each branch in Datadog** — search for the exact log messages and structured attributes from the code using `@field:value` queries, not free-text. This tells you which code path was actually taken (see reference.md for search strategy).
6. **Check data state in Snowflake** — if the issue involves unexpected data or "works for some users but not others," query Snowflake to verify actual data state (see reference.md). Skip if purely code/config.
7. **Cross-reference** — check git history for recent changes. Look for related Linear tickets. Check if the issue correlates with a deploy or flag change.
8. **Summarize findings** — present a structured summary (see Findings Format in reference.md).
9. **Hand off** — ask the user what to do next:
   - Update an existing Linear ticket with findings
   - Create a new ticket (redirect to appropriate ticket skill, carrying context forward)
   - Keep findings, no ticket action

## Hard Rules

1. **Always search Datadog** before concluding. Not optional.
2. **Always include file paths and line numbers.** "The booking service" is not acceptable.
3. **NEVER implement fixes.** This is research only. If you're writing production code, STOP.
4. **Present findings before any ticket action.** The user decides next steps, not you.
5. **Don't invent root causes.** If you can't determine it from evidence, say so.
6. **Carry context forward.** When handing off to a ticket skill, pass all findings.
7. **Trace the full path before forming a hypothesis.** Walk every branch from entry point to outcome.
8. **Use structured Datadog queries, not free-text guesses.** Read the code's logger calls first.

## Red Flags — STOP If You Notice These

| You're about to...                                         | STOP and...                                                                                                         |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Write a fix for the bug you found                          | This is investigation only — present findings first                                                                 |
| Skip Datadog because "I already understand the issue"      | Search Datadog anyway — you might find something unexpected                                                         |
| Form a root cause theory before tracing the full code path | Trace entry point → every branch → expected output first. Hypotheses from partial code reads miss early-return bugs |
| Search Datadog with free-text keywords only                | Read the code's logger calls first, then search using structured attributes (`@field:value`)                        |
| Assume the code is wrong without checking data             | Query Snowflake to verify actual data state before blaming code logic                                               |
| Ignore a feature flag in the code path                     | Look up the flag state in LaunchDarkly — it may be gating the behavior you're investigating                         |

## Cross-Referenced Skills

- `write-bug-ticket`, `write-tech-debt-ticket`, `write-feature-ticket` — for creating tickets from findings
- `datadog-investigate` — API reference for Datadog queries when no Datadog MCP is available
