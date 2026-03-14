<!--
name: 'Skill: /loop slash command'
description: Parses user input into an interval and prompt, converts the interval to a cron expression, and schedules a recurring task
ccVersion: 2.1.71
variables:
  - CRON_CREATE_TOOL_NAME
  - DEFAULT_INTERVAL
  - CRON_CANCEL_TOOL_NAME
  - USER_INPUT
-->

# /loop — schedule a recurring prompt

Parse the input below into \`[interval] <prompt…>\` and schedule it with ${CRON_CREATE_TOOL_NAME}.

## Parsing (in priority order)

1. **Leading token**: if the first whitespace-delimited token matches \`^\\d+[smhd]$\` (e.g. \`5m\`, \`2h\`), that's the interval; the rest is the prompt.
2. **Trailing "every" clause**: otherwise, if the input ends with \`every <N><unit>\` or \`every <N> <unit-word>\` (e.g. \`every 20m\`, \`every 5 minutes\`, \`every 2 hours\`), extract that as the interval and strip it from the prompt. Only match when what follows "every" is a time expression — \`check every PR\` has no interval.
3. **Default**: otherwise, interval is \`${DEFAULT_INTERVAL}\` and the entire input is the prompt.

If the resulting prompt is empty, show usage \`/loop [interval] <prompt>\` and stop — do not call ${CRON_CREATE_TOOL_NAME}.

Examples:

- \`5m /babysit-prs\` → interval \`5m\`, prompt \`/babysit-prs\` (rule 1)
- \`check the deploy every 20m\` → interval \`20m\`, prompt \`check the deploy\` (rule 2)
- \`run tests every 5 minutes\` → interval \`5m\`, prompt \`run tests\` (rule 2)
- \`check the deploy\` → interval \`${DEFAULT_INTERVAL}\`, prompt \`check the deploy\` (rule 3)
- \`check every PR\` → interval \`${DEFAULT_INTERVAL}\`, prompt \`check every PR\` (rule 3 — "every" not followed by time)
- \`5m\` → empty prompt → show usage

## Interval → cron

Supported suffixes: \`s\` (seconds, rounded up to nearest minute, min 1), \`m\` (minutes), \`h\` (hours), \`d\` (days). Convert:

| Interval pattern    | Cron expression          | Notes                                     |
| ------------------- | ------------------------ | ----------------------------------------- |
| \`Nm\` where N ≤ 59 | \`_/N _ \* \* \*\`       | every N minutes                           |
| \`Nm\` where N ≥ 60 | \`0 _/H _ \* \*\`        | round to hours (H = N/60, must divide 24) |
| \`Nh\` where N ≤ 23 | \`0 _/N _ \* \*\`        | every N hours                             |
| \`Nd\`              | \`0 0 _/N _ \*\`         | every N days at midnight local            |
| \`Ns\`              | treat as \`ceil(N/60)m\` | cron minimum granularity is 1 minute      |

**If the interval doesn't cleanly divide its unit** (e.g. \`7m\` → \`_/7 _ \* \* \*\` gives uneven gaps at :56→:00; \`90m\` → 1.5h which cron can't express), pick the nearest clean interval and tell the user what you rounded to before scheduling.

## Action

Call ${CRON_CREATE_TOOL_NAME} with:

- \`cron\`: the expression from the table above
- \`prompt\`: the parsed prompt from above, verbatim (slash commands are passed through unchanged)
- \`recurring\`: \`true\`

Then confirm to the user: what's scheduled, the cron expression, the human-readable cadence, that recurring tasks auto-expire after 3 days, and that they can cancel sooner with ${CRON_CANCEL_TOOL_NAME} (include the job ID).

## Input

${USER_INPUT}
