---
name: babysit-pr
description: "Watch a PR through CI and review feedback: commit/push, wait for CI, auto-fix high-confidence failures, reply to active review threads, and summarize parsed CodeRabbit nitpicks with sentinel-tagged comments. Runs once by default; pass a short interval like `30s` or `2m` for best-effort same-turn polling; longer cadences should use an external loop wrapper. Use when the user says 'babysit my PR', 'watch my PR', 'keep my PR moving', 'respond to comments', or 'loop on CI'."
argument-hint: "[interval]"
---

# Babysit PR

Watch one PR through CI, auto-fix high-confidence failures, and leave a paper-trail reply on every active review thread and CodeRabbit nitpick. Threads stay open for human resolution — this skill only posts replies, it never resolves.

This skill is self-contained: it does not invoke other skills. It works in Claude Code and Codex — no subagents, no `Skill` tool calls, no `!` command interpolation, no `$CLAUDE_PLUGIN_ROOT`.

## Inputs

Parse an optional interval from the invocation arguments if the host exposes them; otherwise read the user's request text.

Recognize intervals with this regex (case-insensitive):

```regex
\b(\d+)\s*(s|sec|secs|second|seconds|m|min|mins|minute|minutes|h|hr|hrs|hour|hours)\b
```

Rules:

- If multiple matches appear in the user's text, take the **first** match.
- Accept a bare number as seconds **only** when the bare number is the entire argument (not embedded in prose).
- Normalize to seconds: `s*=1`, `m*=60`, `h*=3600`.
- Empty → one iteration, then exit with a summary.
- Normalized `<= 240` → best-effort same-turn loop: `sleep <seconds>` between iterations.
- Normalized `> 240` → run one pass, then report that longer cadences need an external loop wrapper (the Claude Code `/loop` skill or a shell `while` loop outside the agent). Do not sleep inside the agent turn — blocking `sleep` past ~5 minutes will exceed prompt-cache TTLs and may hit tool-call timeouts.

## Sentinel

The skill tags every reply it posts with:

```html
<!-- babysit-pr:addressed v1 -->
```

on its own line at the end of the body. This is how the skill knows, on re-runs, which threads and nitpicks it already handled.

**Sentinel recency rules.** The script emits a per-thread `activityState` with three values:

- **`active`** — no sentinel yet, OR at least one human commented after the last sentinel. Always handle this thread.
- **`uncertain`** — a sentinel exists AND one or more bot comments appeared after it. The thread carries a `postSentinelBotComments` array listing EVERY such comment. You MUST read every entry in that array (not just the most recent — a later ack must not hide an earlier actionable finding), then decide:
  - **Every** post-sentinel bot comment is a non-actionable acknowledgement (`"Thanks, resolved"`, `"LGTM"`, `"Learnings added"`, etc.) → mark the thread **Skip-reply**; do not post a new reply. (See step 6 — Skip-reply is a distinct classification from the `addressed` activityState value.)
  - **Any** post-sentinel bot comment carries new actionable content (new nit, new finding, corrected diagnosis) → treat as **active**; reply again AND mention in the final summary that you reactivated an "uncertain" thread and why.
  - If you cannot confidently classify every entry → default to **active** and flag it. Silence is the failure mode we are trying to avoid.
- **`addressed`** — the sentinel is the newest relevant activity on the thread. Skip it.

**Bot detection** uses two signals (union): GraphQL `author.__typename == "Bot"` (primary — catches every GitHub-tagged bot, including ones not on our allowlist), plus a name allowlist (for bots that post via a User-type service account). An unknown bot never falls through to human classification, so a new review bot won't cause an infinite re-reply loop.

The bot detection exists ONLY to downgrade the default for post-sentinel bot activity from `"active"` to `"uncertain"`. It NEVER suppresses bot comments or marks a thread `"addressed"` on its own — CodeRabbit's review content would be lost if it did.

For nitpicks, the script emits a stable `fingerprint` per nitpick (sha256 of file + line + title + body, no timestamp). Before posting a nitpick summary, search existing PR issue-comments for a prior babysit-pr sentinel comment that already contains those fingerprints; if every current fingerprint is already present in a prior sentinel comment, skip posting.

## One iteration

Each iteration is a procedure you execute as ordinary tool calls in the same agent turn. No subagents, no `Skill` tool, no `!` prefix.

### 1. Preflight

Script paths in this procedure are written as `scripts/...`, relative to this SKILL.md. Each host (Claude Code, Codex, …) resolves them from wherever it has the skill installed — do not try to derive an absolute path yourself; it will be wrong under at least one host.

```bash
git status --short
```

If non-empty, stop and report the dirty files. The skill refuses to start with uncommitted changes so it never sweeps up unrelated work.

```bash
gh auth status
```

If this fails, stop and tell the user to run `gh auth login`.

### 2. Locate the PR

```bash
gh pr view --json number,url,headRefName,statusCheckRollup 2>/dev/null
```

If no PR exists for the current branch:

- Verify there are commits ahead of the base branch: `git log --oneline @{u}..HEAD 2>/dev/null || git log --oneline origin/HEAD..HEAD`. If nothing is ahead, stop and report "no commits to push".
- Push the branch and open a PR:

  ```bash
  git push -u origin HEAD
  gh pr create --fill
  ```

- Re-fetch `gh pr view --json number,url,statusCheckRollup`.

### 3. Wait for CI

Wrap the watch call with a timeout so a hung check doesn't wedge the turn:

```bash
rc=0
if command -v gtimeout >/dev/null 2>&1; then
  gtimeout 600 gh pr checks --watch || rc=$?
elif command -v timeout >/dev/null 2>&1; then
  timeout 600 gh pr checks --watch || rc=$?
else
  gh pr checks --watch || rc=$?
fi
case $rc in 0|1|8|124) ;; *) exit $rc;; esac
```

Exit codes 0 (pass), 1 (fail), 8 (pending), and 124 (timeout) are expected and handled next. Other codes (auth errors, etc.) re-raise.

### 4. Fetch review data

```bash
bash scripts/unresolvedPrComments.sh
```

The output JSON has:

- `threads`: every unresolved review thread, with `threadId`, `replyToCommentDatabaseId`, `comments[]`, `lastBabysitSentinelAt`, `lastHumanCommentAt`, `lastBotCommentAt`, `postSentinelBotComments[]`, `postSentinelHumanComments[]`, and `activityState` (`"active"` / `"uncertain"` / `"addressed"`).
- `activeThreads`: threads where `activityState != "addressed"` — these need attention this iteration (active AND uncertain).
- `uncertainThreads`: just the uncertain subset. For each, read EVERY entry in `postSentinelBotComments` before deciding.
- `nitpickComments`: parsed CodeRabbit nitpicks, each with a stable `fingerprint`.
- `totalActiveThreads`, `totalUncertainThreads`, `totalNitpicks`, `totalUnresolvedComments` for quick checks.

### 5. Handle CI failures (conservative)

Run `bash scripts/fetchFailedLogs.sh` to stream failed output for every failing check on the PR. The first line is either:

- `# babysit-pr: no failing checks` → skip to step 6.
- `# babysit-pr: failing checks` → followed by one delimited block per failing job or external check:
  - `# --- run=<id> job=<id> ---` blocks carry the job's `--log-failed` output (GitHub Actions).
  - `# --- external check: <name> (<url>) ---` blocks carry no logs — the check isn't a GitHub Actions run (CircleCI, Nx Cloud, semgrep, CodeRabbit, Devin, etc.). Treat these like "External checks with no inspectable logs" in the diagnosis-only list below: stop and report, don't guess a fix.

Read the logs and diagnose: **build/type errors first** (they cause cascading test failures), then lint/format, then tests.

**Apply a fix directly** only when the cause is high-confidence and inside the PR's changed surface:

- Compile/type errors in files the PR touched.
- Deterministic lint/format violations (auto-fixable).
- Tests that the PR broke by renaming/removing symbols they reference.
- Missing test updates for intentional behavior changes.

**Stop and report a diagnosis** (do not guess a fix) for:

- Flaky / intermittent failures.
- Infrastructure or provider outages.
- Permission / auth / missing-secret failures.
- Unrelated failures (touching code this PR didn't modify).
- Ambiguous test intent.
- External checks with no inspectable logs.

Scope check: `gh pr diff --name-only`. This is PR-authoritative — works even if the local base ref is missing or stale (e.g., in fresh clones or CI sandboxes). A fix outside these files is out of scope — report it, don't apply it.

### 6. Assess active review threads

For every thread in `activeThreads` (this includes both `"active"` and `"uncertain"`):

- Group comments by file; read each file once (not per comment).
- If the referenced file no longer exists, record "comment may be outdated" and classify as **Already fixed**.
- If `activityState == "uncertain"`, read EVERY entry in `postSentinelBotComments` (not just the newest):
  - If EVERY entry is a non-actionable acknowledgement → mark the thread **Skip-reply** (the existing sentinel already covers the thread; posting again would be noise). Do not classify it Agree/Disagree/Already-fixed. Record this in the final summary so the skip is visible.
  - If ANY entry carries new actionable content → treat the thread as new feedback and proceed below. Note in the final summary that an uncertain thread was reactivated, citing the specific comment.
- For each remaining thread (i.e., NOT marked Skip-reply), pick one verdict — each of these will get a reply posted in step 9:
  - **Agree** — the comment identifies a real issue. Apply the fix. Record the thread ID and a one-line what-changed.
  - **Disagree** — the current code is acceptable. Record a short reasoning.
  - **Already fixed** — a prior commit addresses the concern. Record a pointer (commit SHA, file:line).

### 7. Assess nitpicks

For every nitpick in `nitpickComments`:

- Check whether its `fingerprint` already appears in a prior babysit-pr sentinel comment on the PR. If yes, skip.
- Otherwise classify (Agree / Disagree / Already fixed) the same way as threads. If Agree, apply the fix.

If no nitpicks remain after filtering, skip ONLY the top-level nitpick-summary comment in step 9. Still post thread replies for every non-Skip-reply thread from step 6.

### 8. Commit and push (if any edits)

If steps 5, 6, or 7 modified any files, decide:

- **Which files are yours this iteration.** The worktree may contain unrelated in-progress work. Only stage files this iteration touched — if in doubt, run `git diff --name-only` and pick from that list deliberately.
- **A focused commit message.** Prefer something like `babysit-pr: <one-line what-changed>`; the project's commitlint expects conventional-commit form, so a `fix(core): ...` or `docs(core): ...` prefix is usually right.

Then run:

```bash
bash scripts/commitAndPush.sh "<message>" <file1> [<file2> ...]
```

The script enforces explicit staging (never `git add -A`), never skips hooks, and prints:

```text
sha=<commit-sha>
url=https://github.com/<owner>/<repo>/commit/<sha>
```

Capture the `url=` line for the reply templates in step 9.

### 9. Post replies

For every thread assessed in step 6 that was NOT marked **Skip-reply** (i.e., one of Agree / Disagree / Already fixed):

```bash
bash scripts/postSentinelReply.sh "$THREAD_ID" "$BODY"
```

Skip-reply threads (uncertain threads where every post-sentinel bot comment was a non-actionable ack) are left alone — the existing sentinel already covers them.

Body templates (the script appends the sentinel if missing):

- **Agree**: `Addressed in <commit-url>. <one-line what-changed>.`
- **Disagree**: `Leaving current behavior. <reasoning>.`
- **Already fixed**: `Already handled by <commit-url-or-file:line>. <brief pointer>.`

The script uses the `addPullRequestReviewThreadReply` GraphQL mutation. It does NOT resolve the thread.

If any nitpicks were assessed in step 7, post ONE top-level PR comment summarizing all of them:

```bash
bash scripts/postSentinelPrComment.sh "$PR_NUMBER" "$BODY"
```

The nitpick summary body should:

- Group verdicts under **Agree / Disagree / Already fixed** headings.
- Include the commit URL for fixes.
- Include every current nitpick's `fingerprint` in a fenced block at the end (one per line, before the sentinel) so future runs can dedupe.

### 10. Summarize

Report:

- Commits made (with URLs).
- CI checks fixed / still failing / skipped-with-diagnosis.
- Review threads replied to, grouped by verdict.
- Nitpicks summarized (or skipped because already covered).
- Threads left active because of bot-acknowledgement uncertainty (flag by thread URL).
- The stop condition triggered for this iteration (clean / stuck / continue / long-interval / sanity-cap).

## Loop control

After an iteration, pick exactly one outcome:

- **Exit clean** — all CI checks passed AND every thread in `activeThreads` was either marked Skip-reply during step 6's inspection or has already received a fresh sentinel reply in this iteration, AND every current nitpick fingerprint is covered by an existing sentinel comment. Do not use raw `totalActiveThreads` from the script output — it is pre-inspection and will stay non-zero for Skip-reply cases. Report success and stop.
- **Exit stuck** — iteration made no commits, posted no new replies, and no CI check changed state from the previous iteration. Report state and stop; tell the user to investigate.
- **Continue** — interval set, normalized `<= 240`, not clean, not stuck:

  ```bash
  sleep <interval-seconds>
  ```

  Then go back to step 1.

- **Long interval** — interval set, normalized `> 240`. Do not sleep. Run one pass, report state, and tell the user to wrap the call in an external loop (Claude Code `/loop <interval> /babysit-pr` or a shell `while true; do ...; sleep ...; done`).
- **Sanity cap** — hard-stop at 20 iterations regardless, with a clear "sanity cap hit" message. The cap only applies to internal looping.

## Portability notes

- No `Task` subagent spawning — run everything inline.
- No `Skill` tool calls — this skill never invokes `core:commit-push-pr`, `core:fix-ci`, or `core:unresolved-pr-comments`.
- No `!` slash-command prefix in code fences — the agent runs these as ordinary bash.
- No `$CLAUDE_PLUGIN_ROOT` and no host-specific path discovery. Script paths are relative bundled-resource paths like `scripts/unresolvedPrComments.sh`, resolved relative to this SKILL.md.
- `argument-hint` is the only intentional nonstandard frontmatter key (included for Claude Code UX). If a strict Codex validator rejects it, move the key into a host-specific wrapper and keep this file's frontmatter to `name` + `description` only.

## Examples

### Example 1: single pass, exits stuck awaiting CI

User: `babysit my PR`

- No interval → one iteration.
- Preflight OK, PR #482 found.
- `gh pr checks --watch` times out at 600s — two checks still pending.
- `unresolvedPrComments.sh` returns 0 active threads, 0 nitpicks.
- No commits, no replies posted, CI state unchanged vs. start.
- Outcome: **stuck**. Report: "CI still running after 10 min; no comments to address. Re-run `/babysit-pr 2m` once CI settles, or wait and invoke again."

### Example 2: `babysit-pr 2m` loop, exits clean on iteration 3

User: `babysit-pr 2m`

- Iteration 1: CI green, 3 active threads (1 Agree, 1 Disagree, 1 Already-fixed), 2 nitpicks (both Agree). Apply fixes, commit `a1b2c3d`, post 3 thread replies + 1 nitpick summary. Not clean (CI needs to re-run), not stuck. `sleep 120`.
- Iteration 2: CI fails (lint on the nitpick fix). Log shows unused import. High-confidence + in scope → remove import, commit `d4e5f6a`, push. Threads are all addressed. `sleep 120`.
- Iteration 3: CI green, 0 active threads, 0 new nitpick fingerprints. **Exit clean.** Report final commit SHAs and reply URLs.

## Input

Interval: $ARGUMENTS
