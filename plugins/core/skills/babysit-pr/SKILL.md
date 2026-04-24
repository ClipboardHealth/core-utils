---
name: babysit-pr
description: "Watch a PR through CI and review feedback: commit/push, wait for CI, auto-fix high-confidence failures, reply to active review threads, and summarize parsed CodeRabbit review-body comments with sentinel-tagged comments. Runs one pass against the current branch's PR; pass a PR number or URL to `gh pr checkout` that PR first. Use when the user says 'babysit my PR', 'babysit PR 482', 'watch my PR', 'keep my PR moving', or 'respond to comments'."
argument-hint: "[pr-number-or-url]"
---

# Babysit PR

Watch one PR through CI, auto-fix high-confidence failures, and leave a paper-trail reply on every active review thread and CodeRabbit review-body comment. Threads stay open for human resolution — this skill only posts replies, it never resolves.

This skill is self-contained: it does not invoke other skills. It works in Claude Code and Codex — no subagents, no `Skill` tool calls, no `!` command interpolation, no `$CLAUDE_PLUGIN_ROOT`.

## Inputs

Parse an optional PR number or URL from the invocation arguments if the host exposes them; otherwise read the user's request text. Parse in **this priority order** and stop at the first match — do not fall back to a generic "first integer in prose" regex, which would grab unrelated numbers (issue refs, quoted counts, etc.):

1. **Full PR URL** — if `$ARGUMENTS` or the user's text contains `https?://github\.com/[^/\s]+/[^/\s]+/pull/\d+`, capture the URL and pass it to `gh pr checkout` as-is.
2. **Explicit PR token** — match `(?:PR|pr|pull request)\s*#?(\d+)` or a bare `#(\d+)` in the user's text. Capture the numeric group.
3. **Bare numeric argument** — only when the entire `$ARGUMENTS` string is a positive integer (no surrounding prose).
4. **None of the above** — operate on the PR for the current branch (existing Step 2 behavior).

When a match is found, the checkout happens in Preflight before Step 2.

This skill always runs exactly one pass. It never waits or repeats internally. For recurring execution, wrap the call with `/loop <cadence> /babysit-pr` or an external shell `while` loop.

## Sentinels

The skill uses two HTML-comment sentinels.

**Addressed sentinel**: `<!-- babysit-pr:addressed v1 -->`. Appended on its own line at the end of every reply the skill posts (both thread replies and the CodeRabbit summary). This is how the skill knows, on re-runs, which threads and CodeRabbit review-body comments it already handled.

**Follow-up sentinel**: `<!-- babysit-pr:followup v1 -->`. Attached to replies that defer an out-of-scope comment as a tracked follow-up (see the Scope subsection and the Defer verdict in step 6). Grep `babysit-pr:followup` across PR conversation JSON to enumerate deferred items. This sentinel is additive — the post-reply scripts still append the `addressed` sentinel at the end, so a deferred thread is correctly machine-classified as addressed (the skill _has_ handled it — by deferring). Human reviewers and future sweeps distinguish deferred from resolved by looking for the follow-up sentinel.

**Sentinel recency rules.** The script emits a per-thread `activityState` with three values:

- **`active`** — no sentinel yet, OR at least one human commented after the last sentinel. Always handle this thread.
- **`uncertain`** — a sentinel exists AND one or more bot comments appeared after it. The thread carries a `postSentinelBotComments` array listing EVERY such comment. You MUST read every entry in that array (not just the most recent — a later ack must not hide an earlier actionable finding), then decide:
  - **Every** post-sentinel bot comment is a non-actionable acknowledgement (`"Thanks, resolved"`, `"LGTM"`, `"Learnings added"`, etc.) → mark the thread **Skip-reply**; do not post a new reply. (See step 6 — Skip-reply is a distinct classification from the `addressed` activityState value.)
  - **Any** post-sentinel bot comment carries new actionable content (new nit, new finding, corrected diagnosis) → treat as **active**; reply again AND mention in the final summary that you reactivated an "uncertain" thread and why.
  - If you cannot confidently classify every entry → default to **active** and flag it. Silence is the failure mode we are trying to avoid.
- **`addressed`** — the sentinel is the newest relevant activity on the thread. Skip it.

**Bot detection** uses two signals (union): GraphQL `author.__typename == "Bot"` (primary — catches every GitHub-tagged bot, including ones not on our allowlist), plus a name allowlist (for bots that post via a User-type service account). An unknown bot never falls through to human classification, so a new review bot won't cause an infinite re-reply loop.

The bot detection exists ONLY to downgrade the default for post-sentinel bot activity from `"active"` to `"uncertain"`. It NEVER suppresses bot comments or marks a thread `"addressed"` on its own — CodeRabbit's review content would be lost if it did.

For CodeRabbit review-body comments, the script emits a stable `fingerprint` per comment (sha256 of file + line + title + body, no timestamp). This includes CodeRabbit's Nitpick comments, Minor comments, and Outside diff range comments sections. Before posting a summary, search existing PR issue-comments for a prior babysit-pr sentinel comment that already contains those fingerprints; if every current fingerprint is already present in a prior sentinel comment, skip posting.

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

If a PR number or URL was parsed from Inputs, check out that PR now:

```bash
gh pr checkout <pr-number-or-url>
```

This switches the local worktree to the PR's head branch (and handles forks automatically). If the command fails (PR not found, conflicting local branch, etc.), stop and report. The `git status --short` check above runs first so we never check out over dirty work.

### 2. Locate the PR

```bash
gh pr view --json number,url,headRefName,statusCheckRollup 2>/dev/null
```

If Preflight checked out a PR explicitly, `gh pr view` will find it by construction and the fallback below does not apply. The fallback only fires when no PR number was supplied and the current branch has no open PR.

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
- `nitpickComments`: parsed CodeRabbit review-body comments, each with a stable `fingerprint`. The field name is retained for compatibility, but it includes Nitpick comments, Minor comments, and Outside diff range comments.
- `totalActiveThreads`, `totalUncertainThreads`, `totalNitpicks`, `totalUnresolvedComments` for quick checks.

### Scope

This PR's review-feedback scope is strict by default. Steps 6 (threads) and 7 (CodeRabbit review-body comments) classify each comment as in-scope or out-of-scope using this rule before choosing a verdict. Step 5 (CI) uses the broader CI-scope rule in that step, not this one — CI can legitimately fail on unchanged lines because the PR changed a contract or dependency path.

Build the changed-line set from `gh pr diff` once per iteration. Count changed diff lines on both sides: added lines in the new version, removed lines in the old version, and modified code represented by adjacent remove/add pairs. Do not count diff context lines. A reviewer comment or CodeRabbit review-body comment is **in scope** when its anchor falls on a changed diff line on either side of the hunk. Deleted-line comments like "why remove this?" or "please add this back" are in scope by definition. For a range like `12-14`, any overlap with a changed diff line is in scope.

When matching review comments to hunks, use the anchor line provided by `unresolvedPrComments.sh`; it may be the current `line` or the script's fallback to `originalLine`. Compare that anchor against both new-side added ranges and old-side removed ranges.

Comments on unchanged/context lines, touched files outside changed lines, or untouched files are **out of scope by default**.

Narrow escape hatch: treat an unchanged/context-line comment as in scope only when there is an explicit external signal that this PR caused or requires the issue. Acceptable signals:

- The reviewer explicitly ties the concern to this PR's change.
- The comment points to an unchanged line directly used by a changed diff line, and you can name the changed `file:line` that creates the coupling.
- CI, test, or typecheck output proves the PR changed the contract or behavior for the symbol, API, or execution path named by the comment.

If you cannot name one of those signals, classify the comment as out of scope. Do not use broad judgment phrases like "related", "nearby", "maintainability", or "review confidence" to widen scope.

Default posture: focus on in-scope feedback. For out-of-scope feedback, apply the fix **only** if it meets the out-of-scope bar below. Otherwise defer with a follow-up reply.

**Out-of-scope fix bar** (apply the fix even though it's out of scope):

- Security vulnerability, data loss, or crash in the PR's execution path.
- Obvious correctness bug (wrong output, broken invariant) confirmed by reading the referenced code.
- One-line or trivial change that obviously cannot regress anything (typo, missing null check matching surrounding style, etc.).

**Everything else → Defer** (for out-of-scope fix requests that miss the bar): post a Defer reply tagged with the follow-up sentinel (see step 9). Do not expand the PR. Disagree and Already-fixed still apply to out-of-scope comments when the reviewer is wrong or the concern is already handled elsewhere; Defer is specifically for "this is a real but out-of-scope ask we are choosing not to act on here."

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

Scope check for CI: scope is the PR's changed files plus failures directly caused by those changes in the PR's execution path. Use `gh pr diff --name-only` as the first signal — this is PR-authoritative and works even if the local base ref is missing or stale (e.g., in fresh clones or CI sandboxes). Allow fixes outside changed files only when the logs and code make causality clear (e.g., the PR renamed a symbol that a sibling test references). CI failures outside that surface are out of scope — report the diagnosis, don't apply speculative fixes. CI fixes are never Deferred as follow-ups: CI needs to pass on this PR.

### 6. Assess active review threads

For every thread in `activeThreads` (this includes both `"active"` and `"uncertain"`):

- Group comments by file; read each file once (not per comment).
- If the referenced file no longer exists, record "comment may be outdated" and classify as **Already fixed**.
- If `activityState == "uncertain"`, read EVERY entry in `postSentinelBotComments` (not just the newest):
  - If EVERY entry is a non-actionable acknowledgement → mark the thread **Skip-reply** (the existing sentinel already covers the thread; posting again would be noise). Do not classify it Agree/Disagree/Already-fixed. Record this in the final summary so the skip is visible.
  - If ANY entry carries new actionable content → treat the thread as new feedback and proceed below. Note in the final summary that an uncertain thread was reactivated, citing the specific comment.
- Each remaining thread (i.e., NOT marked Skip-reply) gets a scope classification first. Use the Scope subsection to label it in-scope or out-of-scope. For comments on deleted lines, record that the anchor is on the removed side of the diff. For any unchanged/context-line comment classified in scope via the narrow escape hatch, record the external signal and the changed `file:line` when applicable.
- Then pick one verdict — each of these (except Skip-reply) will get a reply posted in step 9:
  - **In-scope** threads use the original three verdicts:
    - **Agree** — the comment identifies a real issue. Apply the fix. Record the thread ID and a one-line what-changed.
    - **Disagree** — the current code is acceptable. Record a short reasoning.
    - **Already fixed** — a prior commit addresses the concern. Record a pointer (commit SHA, file:line).
  - **Out-of-scope** threads apply the out-of-scope fix bar from the Scope subsection:
    - Meets the bar → **Agree** (apply the fix, and note in the reply that it was fixed despite being out of scope because it met the bar).
    - Does not meet the bar → **Defer** (new verdict). Record a one-line rationale and, if relevant, a pointer to where the concern lives.
    - Disagree and Already-fixed can still apply to out-of-scope comments (e.g., reviewer asks for a refactor that's already landed on main, or misreads the code).

### 7. Assess CodeRabbit review-body comments

For every parsed CodeRabbit review-body comment in `nitpickComments`:

- Check whether its `fingerprint` already appears in a prior babysit-pr sentinel comment on the PR. If yes, skip.
- **Classify scope** (in / out) using the Scope subsection. For CodeRabbit ranges like `12-14`, any overlap with changed diff lines on either side of the hunk is in scope; no overlap is out of scope unless one of the explicit escape-hatch signals applies.
- Pick a verdict:
  - In-scope → Agree / Disagree / Already fixed (as with threads). If Agree, apply the fix.
  - Out-of-scope → apply the out-of-scope fix bar. Meets the bar → Agree and apply the fix, noting in the summary that it was fixed despite being out of scope. Does not meet the bar → **Defer**. A Deferred CodeRabbit review-body comment does not get its own top-level comment; it goes into the summary under the **Deferred (out of scope)** heading (see step 9).

Deferred CodeRabbit fingerprints still go into the fenced fingerprint block at the end of the summary alongside addressed ones, so future runs dedupe correctly — the comment is handled, just handled by deferring.

If no CodeRabbit review-body comments remain after filtering, skip ONLY the top-level CodeRabbit summary comment in step 9. Still post thread replies for every non-Skip-reply thread from step 6.

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

For every thread assessed in step 6 that was NOT marked **Skip-reply** (i.e., one of Agree / Disagree / Already fixed / Defer):

```bash
bash scripts/postSentinelReply.sh "$THREAD_ID" "$BODY"
```

Skip-reply threads (uncertain threads where every post-sentinel bot comment was a non-actionable ack) are left alone — the existing sentinel already covers them.

Body templates (the script appends the `addressed` sentinel if missing):

- **Agree**: `Addressed in <commit-url>. <one-line what-changed>.`
- **Disagree**: `Leaving current behavior. <reasoning>.`
- **Already fixed**: `Already handled by <commit-url-or-file:line>. <brief pointer>.`
- **Defer**: `Out of scope for this PR; this looks like follow-up work rather than something introduced or required by this change. <one-line rationale or pointer if useful>.\n\n<!-- babysit-pr:followup v1 -->`

For Defer replies, include the follow-up sentinel on its own line as shown. The script will append the `addressed` sentinel after it on its own line, so the final body ends with the follow-up sentinel followed by a blank line followed by the `addressed` sentinel — `grep babysit-pr:followup` finds the deferral and `grep babysit-pr:addressed` still marks the thread handled for dedupe.

The script uses the `addPullRequestReviewThreadReply` GraphQL mutation. It does NOT resolve the thread.

If any CodeRabbit review-body comments were assessed in step 7, post ONE top-level PR comment summarizing all of them:

```bash
bash scripts/postSentinelPrComment.sh "$PR_NUMBER" "$BODY"
```

The CodeRabbit summary body should:

- Group verdicts under **Agree / Disagree / Already fixed / Deferred (out of scope)** headings. Omit a heading if its list is empty.
- Under **Deferred (out of scope)**, list each deferred CodeRabbit review-body comment as a bullet, followed on its own line by `<!-- babysit-pr:followup v1 -->` so grep catches them individually.
- Include the commit URL for fixes.
- Include every current CodeRabbit review-body comment's `fingerprint` — addressed and deferred — in a fenced block at the end (one per line, before the sentinel) so future runs can dedupe. Deferred comments count as handled for dedupe purposes.

### 10. Summarize

Report:

- Commits made (with URLs).
- CI checks fixed / still failing / skipped-with-diagnosis.
- Review threads replied to, grouped by verdict (including any Defer count: "X threads deferred as follow-ups").
- Nitpicks summarized (or skipped because already covered), including the Deferred count: "Y nitpicks deferred as follow-ups".
- Threads left active because of bot-acknowledgement uncertainty (flag by thread URL).
- The stop condition triggered for this pass (clean / progressing / stuck).

When the report mentions any deferrals, include a one-liner the user can run later to enumerate them, e.g.:

```bash
gh api graphql -f query='query($o:String!,$r:String!,$n:Int!){repository(owner:$o,name:$r){pullRequest(number:$n){reviewThreads(first:100){nodes{comments(first:50){nodes{body url}}}}comments(first:100){nodes{body url}}}}}' -F o=<owner> -F r=<repo> -F n=<pr> | grep -B1 babysit-pr:followup
```

Do not rely only on `gh pr view --json comments,reviews` — that view can miss inline review-thread replies, which is where most Defer replies live.

## Loop control

After the single pass completes, pick exactly one outcome:

- **Exit clean** — all CI checks passed AND every thread in `activeThreads` was either marked Skip-reply during step 6's inspection or has already received a fresh sentinel reply in this pass (Agree / Disagree / Already-fixed / **Defer** all count — a Defer reply is a sentinel reply), AND every current nitpick fingerprint is covered by an existing sentinel comment (deferred nitpicks count; they're in the summary's fingerprint block). Do not use raw `totalActiveThreads` from the script output — it is pre-inspection and will stay non-zero for Skip-reply cases. A PR with Deferred threads is still clean from babysit's perspective: the skill has done what it can without widening scope. Report success and stop.
- **Exit progressing** — pass made commits, posted new replies, or both, and the PR is not yet clean (CI is still pending, a new CI run was triggered by this pass's commits, or more work remains). There is real work still in flight that another run would pick up. Report what was done and what is pending, and tell the user to re-run `/babysit-pr` once CI settles, or to wrap the call with `/loop <cadence> /babysit-pr` (or a shell `while true; do ...; done`) for automatic re-runs.
- **Exit stuck** — pass made no commits and posted no new replies, and the PR is still not clean. Nothing actionable happened this pass. Use this whenever progress is blocked on something outside the skill's scope, including:
  - CI still running (`gh pr checks --watch` timed out with pending checks).
  - CI failing with a diagnosis-only verdict from Step 5 (flaky / infra / auth / external check / ambiguous / out-of-scope failure).
  - Only Skip-reply threads remained AND CI was already red or pending.

  Report the specific blocker (pending vs. diagnosed-failure, with the diagnosis text) and tell the user to investigate or re-run once state may have changed.

This skill never waits or repeats internally.

## Portability notes

- No `Task` subagent spawning — run everything inline.
- No `Skill` tool calls — this skill never invokes `core:commit-push-pr`, `core:fix-ci`, or `core:unresolved-pr-comments`.
- No `!` slash-command prefix in code fences — the agent runs these as ordinary bash.
- No `$CLAUDE_PLUGIN_ROOT` and no host-specific path discovery. Script paths are relative bundled-resource paths like `scripts/unresolvedPrComments.sh`, resolved relative to this SKILL.md.
- `argument-hint` is the only intentional nonstandard frontmatter key (included for Claude Code UX). If a strict Codex validator rejects it, move the key into a host-specific wrapper and keep this file's frontmatter to `name` + `description` only.

## Examples

### Example 1: single pass, exits stuck awaiting CI

User: `babysit my PR`

- No PR arg → operate on the current branch.
- Preflight OK, PR #482 found.
- `gh pr checks --watch` times out at 600s — two checks still pending.
- `unresolvedPrComments.sh` returns 0 active threads, 0 nitpicks.
- No commits, no replies posted, CI state unchanged vs. start.
- Outcome: **stuck**. Report: "CI still running after 10 min; no comments to address. Re-run `/babysit-pr` once CI settles, or wrap with `/loop 2m /babysit-pr`."

### Example 2: explicit PR number checks out and babysits that PR

User: `babysit PR 482`

- Preflight OK. Input parser matches the explicit-token rule and captures `482`.
- `gh pr checkout 482` switches the worktree to PR #482's head branch (say, `feat/xyz`).
- Step 2's `gh pr view` confirms PR #482 on the now-current branch; the new-PR fallback does not fire.
- Remainder proceeds as a normal single pass (CI watch, thread / nitpick assessment, replies).
- Report final state on exit.

### Example 3: out-of-scope nitpick gets deferred

User: `babysit my PR`

- Preflight OK, PR #612 found, CI green.
- `unresolvedPrComments.sh` returns 1 active thread and 2 nitpicks:
  - Thread on `src/users.ts:82` (unchanged, not touched by diff) — reviewer: "while you're here, this helper could be memoized".
  - Nitpick on `src/orders.ts:45-47` — anchor overlaps a changed line; CodeRabbit says the error message should use backticks. In scope.
  - Nitpick on `src/unrelated.ts:10` — file not touched by the PR. Out of scope, no escape-hatch signal.
- Scope classification:
  - Thread is on an unchanged line; reviewer doesn't tie it to this PR's changes; doesn't meet the fix bar (not a crash, not a bug, not trivial). → **Defer**.
  - First nitpick is in-scope → **Agree**, apply backtick fix.
  - Second nitpick is out-of-scope, not a correctness bug, not a one-liner → **Defer** (goes under the Deferred (out of scope) heading in the summary).
- Commit `f00dbabe` for the in-scope nitpick fix. Post Defer reply on the thread with the `babysit-pr:followup v1` sentinel above the `addressed` sentinel. Post the nitpick summary with Agree (1) and Deferred (out of scope) (1) headings; both fingerprints listed in the fenced block.
- Summary reports: "1 thread deferred as follow-up, 1 nitpick deferred as follow-up" plus the `gh api graphql ... | grep babysit-pr:followup` one-liner.
- **Exit clean** — Defer replies count as fresh sentinel replies; all fingerprints are covered.

## Input

PR number or URL: $ARGUMENTS
