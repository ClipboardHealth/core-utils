---
name: update-tempo-alerts
description: "Incrementally update the '🚨 Tempo alerts' Notion doc from the #team-tempo-alerts Slack channel. Reads Datadog + Hex alerts posted since the current week's 'Last updated' cursor, updates the Summary table (incrementing Warn/Error counts for repeat alerts instead of duplicating rows) and the numbered detail sections below, then advances the cursor. Meant to be run daily. Triggers on: update tempo alerts, tempo alerts update, daily tempo alerts, refresh tempo alerts, /update-tempo-alerts."
---

# Update Tempo Alerts

You maintain the **🚨 Tempo alerts** Notion tracking doc by incrementally pulling new alerts from the `#team-tempo-alerts` Slack channel. Each run reads only alerts posted **since the current week's `Last updated` cursor**, folds them into the current-week section, and advances the cursor — so nothing is ever double-counted or duplicated.

The golden rule: **a repeat of an alert already in the table does NOT create a new row or a new detail section. It increments the existing Warn/Error count and updates that alert's existing detail section.** Only a genuinely new alert (a monitor ID / Hex project not yet in this week's table) gets a new row + new detail section.

## Reference (constants)

- Notion page: **🚨 Tempo alerts** — id `39e8643321f480ec8a6ff1b1bad7821f`
- Slack channel: `#team-tempo-alerts` = `C08S3CL8G2U`
- Bot senders: **Datadog** `U02DL2DEZTP`, **Hex** `U04GQJKDNCD`, **Devin** `U08DDF6590B`
- Week boundaries & display timezone: **IST (UTC+5:30, no DST)**. Slack `ts` are epoch seconds (UTC).
- Time helper (portable, Mac/Linux): `python3 "<this skill dir>/scripts/times.py"` — see usage in Step 1.

## Tools you will use

This skill needs two capabilities from your agent. The names below are the Claude Code MCP tools; use whatever equivalent your agent exposes (the steps refer to them by their short names, e.g. `slack_read_channel`, `notion-fetch`).

- **Read Slack** — a channel's message history and thread replies (Claude Code: `mcp__claude_ai_Slack__slack_read_channel`, `mcp__claude_ai_Slack__slack_read_thread`).
- **Read & update Notion** — fetch a page and edit its content (Claude Code: `mcp__claude_ai_Notion__notion-fetch`, `mcp__claude_ai_Notion__notion-update-page`).

In Claude Code these may be **deferred MCP tools** — if they aren't already callable, load them first (e.g. tool search: `select:mcp__claude_ai_Slack__slack_read_channel,mcp__claude_ai_Slack__slack_read_thread,mcp__claude_ai_Notion__notion-fetch,mcp__claude_ai_Notion__notion-update-page`).

## Classification rules (how to bucket each message)

Only messages from **Datadog** or **Hex** count as alerts. Ignore Devin (`U08DDF6590B`) and human messages when counting (they are actions/thread content, used only in Step 5).

- Datadog text starting with **`Warn:`** → **+1 Warn** firing.
- Datadog **`Triggered:`**, **`Alert:`**, **`Re-Triggered:`**, **`No Data:`** → **+1 Error** firing.
- Datadog **`Recovered:`** / **`OK:`** → a recovery. **Does NOT increment counts.** Use it only to inform Status (e.g. it auto-recovered).
- Hex message containing **"has failed to run"** → **+1 Error** firing.
- Anything else from these bots (e.g. Hex success) → ignore.

**Dedup key** (identity of an alert within the week):
- Datadog → the **monitor id**, parsed from the monitor URL `.../monitors/<ID>` in the message.
- Hex → the **project name** (the linked title text, e.g. "Megadata Shift Punch data sharing ETL").

## Step 0 — Load the page & the current counts

Fetch the page with `notion-fetch` (id `39e8643321f480ec8a6ff1b1bad7821f`). Before editing later, also read the Notion markdown spec once via the MCP resource `notion://docs/enhanced-markdown-spec` (read it through the resource interface; do NOT pass that URI to a fetch tool).

Note the current structure: an intro callout, a table of contents, then one `# <mention-date start="YYYY-MM-DD"/> … {toggle="true"}` toggle heading **per week**, each containing a `Last updated` line, a `### Summary` table with columns `S.no | Monitor ID | Title | Status | Count`, and numbered `### N. …` detail sections.

## Step 1 — Determine the current week & locate its section

Run `python3 "<skill dir>/scripts/times.py"` (no args). It prints:
`NOW_EPOCH`, `NOW_UTC`, `NOW_IST`, `WEEK_MONDAY_IST_DATE` (this week's Monday, e.g. `2026-07-13`), `WEEK_MONDAY_EPOCH` (Monday 00:00 IST as epoch).

Find the week section whose toggle heading's `mention-date start` equals `WEEK_MONDAY_IST_DATE`.

- **If a section for this week already exists** → that is your target section; go to Step 2.
- **If it does NOT exist** → you are the first run of a new week. Do **Step 1b first** to create the section, then continue.

## Step 1b — Create the new week's collapsible section first (if missing)

When there is no section for `WEEK_MONDAY_IST_DATE`, **create that week's section before processing any alerts.** Never fold this week's alerts into the previous week's section.

Make it look just like the existing week sections: a **collapsible toggle heading** (`{toggle="true"}`) tagged with a `mention-date`, and — indented **one tab** so they live inside the toggle — a `Last updated` line, a `### Summary` heading, and an empty Summary `<table>` with the same five columns. Best practice: copy the `<colgroup>` widths and the heading format from the most recent existing week section so the new one is visually identical. Use this skeleton as the fallback (toggle children are tab-indented; keep `<tr>/<td>` un-indented to match the existing table):

  ```
  # <mention-date start="WEEK_MONDAY_IST_DATE"/> {toggle="true"}
  	*Last updated: <>*
  	### Summary
  	<table header-row="true">
  	<colgroup>
  	<col width="52">
  	<col width="120">
  	<col width="331">
  	<col width="88">
  	<col width="72">
  	</colgroup>
  <tr>
  <td>S.no</td>
  <td>Monitor ID</td>
  <td>Title</td>
  <td>Status</td>
  <td>Count</td>
  </tr>
  	</table>
  ```

Insert the new section as the **top-most** week (immediately after the `<table_of_contents .../>` line, so the newest week is first) using `notion-update-page`. Leave `Last updated` as the `<>` placeholder — Step 2 treats that as the start of the week (`WEEK_MONDAY_EPOCH`). This new, empty section is now your target section for the rest of the run.

## Step 2 — Read the cursor (`oldest`)

In the target week's section, read the line `*Last updated: … (Slack ts <TS>)*` and extract `<TS>`.

- If present → `OLDEST = <TS>`.
- If the line is still the placeholder `*Last updated: <>*` or missing → `OLDEST = WEEK_MONDAY_EPOCH` (start of the week).

Treat `OLDEST` as **exclusive**: later, ignore any message whose `ts` ≤ `OLDEST` (the Slack `oldest` param is inclusive, so it may echo the boundary message back).

## Step 3 — Pull new Slack messages

Call `slack_read_channel` with `channel_id=C08S3CL8G2U`, `oldest=OLDEST`, `limit=100`, `response_format="detailed"` (detailed includes thread-reply counts). Do **not** set `latest` (defaults to now). If the response has a `next_cursor`, paginate until there are no more messages. Collect every message.

Keep only Datadog/Hex messages with `ts > OLDEST`, and classify each per the rules above. Record, per dedup key: `+Warn`, `+Error` tallies, the newest firing time, and the message `ts` values (you need the newest alert `ts` for Step 7). Track recoveries separately (for Status only).

If there are **no new alert messages**, skip to Step 8 and report "no new alerts" — leave the table and cursor unchanged.

## Step 4 — Split into "repeat" vs "new"

For each dedup key with new firings, check whether a row already exists in the **target week's** Summary table (Datadog: matching monitor id in the Monitor ID column; Hex: matching Title). Bucket each as **repeat** (row exists) or **new** (no row).

## Step 5 — Gather actions from threads (for new alerts, and repeats with new thread activity)

For each relevant alert message that shows `Thread: N replies`, read it with `slack_read_thread`. Human replies like "@Devin investigate" spawn a **Devin session** (a separate top-level Devin message with its own thread) — follow that session thread too; the root-cause summary and recommended fix usually live there. Summarize into a one-paragraph **What we did**. If there are no replies and no action, use **TBD**.

Pick a **Status** from this vocabulary based on thread outcome:
`✅ Resolved` · `✅ Actioned` · `🛠️ PR raised` · `🔍 Investigated` (follow-up pending) · `↩︎ Recovered` (auto-recovered, no action) · `⏳ TBD`.

## Step 6 — Apply updates to the current-week section

Re-fetch the page right before editing (the doc may be edited live by others; always match against current content). Prefer targeted `notion-update-page` `update_content` search/replace with unique anchors over whole-page `replace_content`.

**For each REPEAT alert:**
1. **Count cell** — find that row's `Count` cell (`Warn: a<br>Err: b`) and replace with the new totals (`Warn: a+ΔWarn<br>Err: b+ΔErr`). Match the whole `<td>Warn: …<br>Err: …</td>` for that row; if ambiguous, include the adjacent `<td>` (Title or Monitor ID) in the anchor.
2. **Detail section** — update its header count line to the new cumulative `… · Warn ×N · Err ×M`. Under **Why it fired**: if the new firings share the cause already described, just refresh counts / latest-seen time — **do not duplicate text**. If they are a genuinely different cause or occurrence, append a dated sub-bullet, e.g. `- **Also (YYYY-MM-DD IST):** <new cause>`. Update **What we did** / **Status** only if there is new thread activity.

**For each NEW alert:**
1. **Add a table row** — insert a new `<tr>` immediately before this section's `</table>`. Use the next `S.no`. Monitor ID: for Datadog use a link `[<id>](https://app.datadoghq.com/monitors/<id>)`; for Hex use `Hex`. Fill Title, Status, and `Count` = `Warn: N<br>Err: M`.
2. **Add a detail section** — append a new block after the last existing detail of this week (and before the next week's `#` heading, if any):

   ```
   	### N. <Title>
   	**Monitor** `<id>` · Datadog · Warn ×N · Err ×M      (Hex: use "**Hex** · scheduled run · …")
   	- **Why it fired:** <cause / what the monitor measures / when it fired>
   	- **What we did:** <action, or TBD>
   ```
   Every line of a detail block must start with **one tab** so it stays nested under the week toggle.

### Notion editing gotchas (learned the hard way)
- **Tabs, not spaces**, to nest under the toggle heading. Table `<tr>/<td>` rows sit un-indented inside `<table>` — match the existing style.
- Count cells use a literal `<br>`: `Warn: N<br>Err: M`.
- **Auto-linkification**: bare tokens that look like domains (e.g. `S.no`) get turned into bogus links in prose — wrap such tokens in `` `inline code` `` or avoid them.
- Escape stray `<`, `>`, `{`, `}` in prose; put threshold expressions like `errors/hits > 0` inside `` `backticks` ``.
- If an `update_content` `old_str` fails to match, re-fetch and copy the exact current text (someone may have edited it).

## Step 7 — Advance the cursor

Set `NEWEST_TS` = the largest `ts` among the Datadog/Hex messages you considered this run (Warn, Error, and recoveries all count as "considered"). Convert it: `python3 "<skill dir>/scripts/times.py" utc <NEWEST_TS>`.

Replace the section's `Last updated` line with:
`*Last updated: <UTC datetime> (Slack ts <NEWEST_TS>)*`
(keep the full fractional `ts` — it is the exact cursor the next run reads). If there were no new alerts, leave the cursor unchanged.

## Step 8 — Report

Print a concise summary: week section targeted, window processed (`OLDEST` → `NEWEST_TS` in UTC), which alerts were **incremented** (with old→new counts), which were **added** (new rows), any **Status/action** changes, the new `Last updated` value, and the page link `https://app.notion.com/p/39e8643321f480ec8a6ff1b1bad7821f`. Do not ask for confirmation — this is a daily unattended update — but surface anything ambiguous (e.g. an unfamiliar Datadog prefix, or a possible duplicate title) for the user to double-check.
