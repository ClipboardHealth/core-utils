# Investigation Reference

## Tool Availability

This skill uses MCP tools when available: Datadog MCP for logs/traces/metrics, Snowflake MCP for data queries, LaunchDarkly MCP for flag state. If the Datadog MCP is not configured, use the `datadog-investigate` skill as an API reference — it provides curl commands and `dog` CLI patterns for querying logs, traces, metrics, and monitors directly.

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
