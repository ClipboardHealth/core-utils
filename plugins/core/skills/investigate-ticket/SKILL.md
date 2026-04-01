---
name: investigate-ticket
description: Use when investigating a bug, incident, or issue before implementation. Researches codebase, queries Datadog, and presents structured findings with handoff options. Also use when asked to "look into" or "investigate" something.
---

# Investigate Ticket

Research-only workflow for understanding bugs, incidents, or issues before any implementation begins. Produces a structured summary with evidence, then hands off to ticket creation or update.

**This is NOT an implementation skill.** No code changes, no fixes, no PRs. Investigation only.

## Process

1. **Gather context** — accept a ticket ID/URL, Slack thread, Datadog alert, or verbal description. If a Linear ticket exists, fetch it for current details.
2. **Initial Datadog scan** — do a quick, broad search for obvious signals: error messages, user IDs, timeframes, service names, endpoint paths. The goal is orientation, not root cause. Note what you find (or don't), but **do not form a hypothesis yet**.
3. **Trace the full execution path** — find the relevant code paths in the current repo. Starting from the entry point (controller, webhook handler, cron job), trace through **every branch, early return, and conditional** to the expected outcome. For each branch, note:
   - What condition triggers it
   - What log message it produces (exact message string and structured attributes)
   - What would cause the code to take that path vs. continue
   - Whether a feature flag gates the branch (note the flag key if so)
     This is the most important step. Do NOT skip branches that seem unlikely — those are exactly where non-obvious bugs hide.
4. **Check feature flags** — if you found feature flag checks during step 3, look up each flag's current state. See the LaunchDarkly Investigation section below for how to check flag state, targeting rules, and whether a recent flag change correlates with the issue.
5. **Validate each branch in Datadog** — now that you know the exact log messages and attribute names from the code, search Datadog using **structured attribute queries** to determine which code path was actually taken. This confirms or eliminates each branch as the failure point. See the Datadog Search Strategy section below.
6. **Check data state in Snowflake** — if the issue involves unexpected data, missing records, or "works for some users but not others," query Snowflake to verify what the data actually looks like. See the Snowflake Investigation section below. Skip this step if the issue is purely code/config.
7. **Cross-reference** — check git history for recent changes to affected files. Look for related tickets in Linear. Check if the issue correlates with a deploy or flag change.
8. **Summarize findings** — present a structured summary to the user (see format below).
9. **Hand off** — ask the user what to do next (see Handoff Options below).

## Datadog Search Strategy

- **Always use structured attributes** (`@field:value`) over free-text when the code tells you what attributes are logged. Free-text searches like `sms reply 3107221978` miss logs where those words don't appear together in the message field.
- **When a specific user/entity is involved, search for their identifier in application logs first.** This shows you exactly which code path was taken. Example: `@logContext:SmsReplyForwarderService @from:"+13107221978"` instead of `knock-sms-replies 3107221978`.
- **Don't rely solely on the absence of logs as evidence.** Verify your query matches the actual attribute names logged in the code. A zero-result search might mean "the event didn't happen" or it might mean "your query was wrong."
- **Read the code's logger calls to discover searchable attributes.** If the code logs `this.logger.info("SMS not sent to Knock number", { to, expectedNumber })`, search for `@logContext:ServiceName "SMS not sent to Knock number"` — not a free-text guess.

## LaunchDarkly Investigation

When you encounter a feature flag in the code during step 3, investigate it:

1. **Identify the flag key** from the code (e.g., `getVariation("my-flag-key", ...)` or config references).
2. **Look up the flag state** using `get-feature-flag` with the project key and flag key. Check:
   - Is the flag on or off in the relevant environment (production, staging)?
   - What are the variations and which is the default/fallback?
   - What are the targeting rules — is the affected user/segment included or excluded?
3. **Check for recent changes** — flag changes don't show up in git history. If the issue started at a specific time, check whether a flag was toggled around that time.
4. **Find all code references** using `get-code-references` to understand the full scope — the flag may affect multiple code paths across repos.

**Common flag-related investigation patterns:**

- **"Works in staging, broken in production"** → Check if the flag has different states per environment.
- **"Works for some users but not others"** → Check targeting rules and percentage-based roll outs.
- **"Broke suddenly with no deploy"** → A flag was likely toggled. Check flag change history.
- **Code path seems unreachable** → A flag may be gating it off. Check if it's turned on.

## Snowflake Investigation

When the issue involves data state — missing records, unexpected values, "works for user A but not user B" — query Snowflake to see what the data actually looks like.

**When to use Snowflake:**

- The code logic looks correct but produces wrong results → the input data may be unexpected
- A user reports an issue that can't be reproduced → check their specific data
- You need to quantify impact (how many users/records are affected)
- You need to verify whether a data migration or backfill completed correctly

**How to query effectively:**

- **Start narrow, then widen.** Query the specific entity first (user ID, shift ID, facility ID), then broaden to find patterns.
- **Check timestamps.** When did the data enter this state? Does it correlate with a deploy, flag change, or migration?
- **Compare working vs. broken.** If it works for user A but not user B, query both and diff the records to find what's different.
- **Don't modify data.** This is investigation only — `SELECT` queries only. Never run `UPDATE`, `DELETE`, or `INSERT` during investigation.

**Include Snowflake findings in evidence.** When you find relevant data, include the query and key results in the Evidence section of your findings (summarize, don't dump raw tables).

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
- LaunchDarkly: <flag key> is <on/off> in <env>, targeting <rules summary> (if relevant)
- Snowflake: <query summary and key finding> (if relevant)
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
3. Just keep the findings — no ticket action needed
```

- **Option 1:** Update the ticket description with findings. Preserve existing content, add investigation section.
- **Option 2:** Redirect to `write-bug-ticket`, `write-tech-debt-ticket`, or `write-feature-ticket` as appropriate, carrying the investigation context forward.
- **Option 3:** Done. No further action.

## Hard Rules

1. **Always search Datadog** before concluding the investigation. Not optional, even if the user didn't mention monitoring.
2. **Always include code file paths and line numbers.** Vague references like "the booking service" are not acceptable.
3. **NEVER start implementing fixes** during investigation. This is research only. If you find yourself writing production code, STOP.
4. **Present findings before any ticket action.** The user decides what to do with the findings, not you.
5. **Don't invent root causes.** If you can't determine root cause from evidence, say so. Speculation presented as fact wastes the investigator's time.
6. **Carry context forward.** When handing off to a ticket skill, pass all investigation findings so the ticket skill doesn't re-ask for information you already gathered.
7. **Trace the full execution path before forming a hypothesis.** Skimming code and jumping to the most "obvious" filter or check leads to wrong conclusions. Walk every branch from entry point to outcome.
8. **Validate with structured Datadog queries, not free-text guesses.** Read the code's logger calls to know exactly what attributes and messages to search for.

## Red Flags — STOP If You Notice These

| You're about to...                                         | STOP and...                                                                                                                |
| ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Write a fix for the bug you found                          | This is investigation only — present findings first                                                                        |
| Skip Datadog because "I already understand the issue"      | Search Datadog anyway — you might find something unexpected                                                                |
| Present vague findings without file paths                  | Go back and trace the actual code paths                                                                                    |
| Create a ticket without presenting findings first          | Show the user what you found and let them decide                                                                           |
| Guess the root cause without evidence                      | Say "root cause not yet determined" and list what you checked                                                              |
| Form a root cause theory before tracing the full code path | Trace entry point → every branch → expected output first. Hypotheses formed from partial code reads miss early-return bugs |
| Search Datadog with free-text keywords only                | Read the code's logger calls first, then search using structured attributes (`@field:value`)                               |
| Assume the code is wrong without checking data             | Query Snowflake to verify the actual data state before blaming code logic                                                  |
| Ignore a feature flag in the code path                     | Look up the flag state in LaunchDarkly — it may be gating the behavior you're investigating                                |

## Cross-Referenced Skills

- `write-bug-ticket` — for creating bug tickets from investigation findings
- `write-tech-debt-ticket` — for creating tech debt tickets from investigation findings
- `write-feature-ticket` — for creating feature tickets from investigation findings
