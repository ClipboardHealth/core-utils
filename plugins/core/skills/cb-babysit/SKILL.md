---
name: cb-babysit
description: Watch a PR through CI and review feedback. Auto-fix high-confidence failures and address review comments. Use when the user says 'babysit <PR>' or 'respond to PR comments'.
argument-hint: "[pr-number-or-url]"
---

## Setup

The user invokes this skill with an optional PR number or URL. Parse in this order and stop at the first match:

1. **Full PR URL**: if the user's text contains `https?://github\.com/[^/\s]+/[^/\s]+/pull/\d+`, capture the URL.
2. **Explicit PR token**: match `(?:PR|pr|pull request)\s*#?(\d+)` or a bare `#(\d+)` in the user's text.
3. **Bare numeric argument**: only when the complete text is a positive integer without surrounding prose.
4. **None of the above**: operate on the PR for the current branch.

Resolve bundled "./scripts" paths relative to SKILL.md.

## Sentinels

The skill uses two sentinels with visible footer lines.

**Addressed sentinel**: `<sub>🤖 <code>cb-babysit:addressed v1 core@3.10.1</code></sub>`. Appended on its own line at the end of every reply the skill posts so re-runs know which threads and review-body comments are already handled. Dedupe also recognizes the legacy `babysit-pr:addressed v1` prefix from before this skill was renamed.

**Follow-up sentinel**: `<sub>🤖 <code>cb-babysit:followup v1 core@3.10.1</code></sub>`. Attached to replies that defer an out-of-scope comment as a tracked follow-up. The sentinel is additive: the post-reply scripts still append the `addressed` sentinel at the end.

**Sentinel recency rules.** The script emits a per-thread `activityState` with three values. Step 6a owns the handling rules for each state.

- **`active`**: no sentinel yet, OR at least one human commented after the last sentinel.
- **`uncertain`**: a sentinel exists AND one or more bot comments appeared after it. The thread carries a `postSentinelBotComments` array listing EVERY such comment.
- **`addressed`**: the sentinel is the newest relevant activity on the thread.

Automated review bodies and top-level Conversation-tab comments each carry a stable `fingerprint` (sha256 of the normalized body); prior sentinel bodies embed them, and steps 4 and 7 do the dedupe.

## Workflow

### 1. Preflight

```bash
git status --short
```

If non-empty, classify the dirty files against the target PR's changed paths (`gh pr diff --name-only`):

- Any dirty file overlaps the PR's surface, or you cannot confidently classify → stop and report. The skill never starts where it might sweep up related in-progress work.
- All dirty files are clearly unrelated (disjoint paths, pre-existing edits) → stash exactly those files by name with a labeled stash (`git stash push -m "cb-babysit: pre-existing unrelated work (auto-restored)" -- <paths>`), proceed, and `git stash pop` as the final step of the pass, including on early exits. Report the stash/restore in the summary.

If a PR number or URL was parsed from inputs, check out that PR now:

```bash
gh pr checkout <pr-number-or-url>
```

If the command fails, stop and report.

### 2. Locate the PR

```bash
gh pr view --json number,url,headRefName,statusCheckRollup,mergeable,mergeStateStatus 2>/dev/null
```

If no PR exists for the current branch, stop and report.

#### Resolve merge conflicts, if any

If `mergeable == "CONFLICTING"` (or `mergeStateStatus == "DIRTY"`), merge the base into the PR branch locally:

```bash
BASE=$(gh pr view --json baseRefName --jq .baseRefName)
git fetch origin "$BASE"
git merge --no-edit "origin/$BASE"
```

Resolve directly only for lockfile/generated regenerations, additive non-overlapping edits, or trivial textual conflicts in PR-touched files. `git merge --abort` for anything semantic, ambiguous, or outside the PR's intentional surface, and skip to step 10 to exit **stuck** with a diagnosis. After a clean resolution, commit the merge and `git push origin HEAD`.

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
- `activeThreads`: threads where `activityState != "addressed"`; these need attention this pass (active AND uncertain).
- `uncertainThreads`: just the uncertain subset. For each, read EVERY entry in `postSentinelBotComments` before deciding.
- `reviewBodyComments`: every review from a known automated reviewer (CodeRabbit, Mendral, Dependabot, etc.), with the raw body and a stable per-review `fingerprint`. The agent reads each body directly to extract findings.
- `issueComments`: every top-level Conversation-tab comment, each with `isBabysitSentinel`, `isKnownBot`, and a per-comment `fingerprint`.
- `activeIssueComments`: the subset of `issueComments` that are NOT cb-babysit sentinels, NOT from a known bot, and whose `fingerprint` is NOT already listed in any prior cb-babysit summary. These are the human Conversation-tab comments still needing a reply.
- `priorBabysitSentinels`: prior cb-babysit summary comments posted as PR issue-comments. The script does the dedupe lookup for `activeIssueComments` automatically; the agent uses this array for `reviewBodyComments` dedupe.
- `truncated`: array naming any GraphQL connection that hit GitHub's 100-item cap (`reviewThreads`, `thread-comments`, `reviews`, `issueComments`). Non-empty means some comments may not be in this JSON; surface this in the final summary.
- `totalActiveThreads`, `totalUncertainThreads`, `totalActiveIssueComments`, `totalReviewBodyComments`, `totalUnresolvedComments` for quick checks.

### Scope

This PR's review-feedback scope is strict by default. Steps 6a (threads), 6b (top-level conversation comments), and 7 (automated review bodies) classify each comment as in-scope or out-of-scope using this rule before choosing a verdict. Step 5 (CI) uses the broader CI-scope rule in that step, not this one. CI can legitimately fail on unchanged lines because the PR changed a contract or dependency path.

Build the changed-line set from `gh pr diff` once per pass. Count changed diff lines on both sides: added lines in the new version, removed lines in the old version, and modified code represented by adjacent remove/add pairs. Do not count diff context lines. A reviewer comment or automated review-body comment is **in scope** when its anchor falls on a changed diff line on either side of the hunk. Deleted-line comments like "why remove this?" or "please add this back" are in scope by definition. For a range like `12-14`, any overlap with a changed diff line is in scope.

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

**All other out-of-scope fix requests → Defer**: post a Defer reply tagged with the follow-up sentinel (see step 9). Do not expand the PR. Defer is specifically for "this is a real but out-of-scope ask we are choosing not to act on here."

### 5. Handle CI failures

Run `bash scripts/fetchFailedLogs.sh` to stream failed output for every failing check on the PR. The first line is either:

- `# cb-babysit: no failing checks` → skip to step 6a.
- `# cb-babysit: failing checks` → followed by one delimited block per failing job or external check:
  - `# --- run=<id> job=<id> ---` blocks carry the job's `--log-failed` output (GitHub Actions).
  - `# --- external check: <name> (<url>) ---` blocks carry no logs, the check isn't a GitHub Actions run (e.g., Nx Cloud, semgrep, CodeRabbit). Treat these like "External checks with no inspectable logs" in the diagnosis-only list below: stop and report, don't guess a fix.

Read the logs and diagnose: **build/type errors first** (they cause cascading test failures), then lint/format, then tests.

**Apply a fix directly** only when the cause is high-confidence and inside the PR's changed surface:

- Compile/type errors in files the PR touched.
- Deterministic lint/format violations.
- Tests that the PR broke by renaming/removing symbols they reference.
- Missing test updates for intentional behavior changes.

**Stop and report a diagnosis** (do not guess a fix) for:

- Flaky/intermittent failures.
- Infrastructure or provider outages.
- Permission/auth/missing-secret failures.
- Unrelated failures (touching code this PR didn't modify).
- Ambiguous test intent.
- External checks with no inspectable logs.

Scope check for CI: scope is the PR's changed files plus failures directly caused by those changes in the PR's execution path. Use `gh pr diff --name-only` as the first signal. Allow fixes outside changed files only when the logs and code make causality clear (e.g., the PR renamed a symbol that a sibling test references). CI failures outside that surface are out of scope. Report the diagnosis, don't apply speculative fixes. CI fixes are never Deferred as follow-ups: CI needs to pass on this PR.

### 6a. Assess active review threads

For every thread in `activeThreads` (this includes both `"active"` and `"uncertain"`):

- Group comments by file; read each file once (not per comment).
- If the referenced file no longer exists, record "comment may be outdated" and classify as **Already fixed**.
- If `activityState == "uncertain"`, read EVERY entry in `postSentinelBotComments` (not just the newest):
  - If EVERY entry is a non-actionable acknowledgement (e.g., `"Thanks, resolved"`, `"LGTM"`, `"Learnings added"`) → mark the thread **Skip-reply** (the existing sentinel already covers the thread; posting again would be noise). Do not classify it Agree/Disagree/Already-fixed. Record this in the final summary so the skip is visible.
  - If ANY entry carries new actionable content (new nit, new finding, corrected diagnosis) → treat the thread as new feedback and proceed below. Note in the final summary that an uncertain thread was reactivated, citing the specific comment.
  - If you cannot confidently classify every entry → default to treating it as new feedback.
- Each remaining thread (i.e., NOT marked Skip-reply) gets a scope classification first. Use the Scope subsection to label it in-scope or out-of-scope. For comments on deleted lines, record that the anchor is on the removed side of the diff. For any unchanged/context-line comment classified in scope via the narrow escape hatch, record the external signal and the changed `file:line` when applicable.
- Then pick one verdict; each of these (except Skip-reply) will get a reply posted in step 9:
  - **In-scope** threads use the original three verdicts:
    - **Agree**: the comment identifies a real issue. Apply the fix. Record the thread ID and a one-line what-changed.
    - **Disagree**: the current code is acceptable. Record a short reasoning.
    - **Already fixed**: a prior commit addresses the concern. Record a pointer (commit SHA, file:line).
  - **Out-of-scope** threads apply the out-of-scope fix bar from the Scope subsection:
    - Meets the bar → **Agree** (apply the fix, and note in the reply that it was fixed despite being out of scope because it met the bar).
    - Does not meet the bar → **Defer** (new verdict). Record a one-line rationale and, if relevant, a pointer to where the concern lives.
    - Disagree and Already-fixed can still apply to out-of-scope comments (e.g., reviewer asks for a refactor that's already landed on main, or misreads the code).

### 6b. Assess top-level Conversation-tab comments

For every entry in `activeIssueComments`, humans commenting on the PR Conversation tab without anchoring to a file/line:

- Apply the **Scope** subsection's rules. A top-level comment is in scope when the reviewer explicitly ties it to a changed file/line, behavior the PR introduced, or a contract the PR altered. Otherwise out of scope by default.
- Pick a verdict the same way as a thread: Agree / Disagree / Already fixed (in-scope), or Agree-meets-bar / Defer (out-of-scope). Apply fixes for Agree verdicts.
- Replies are NOT posted as individual top-level comments. That would clutter the conversation. Instead, every issue-comment verdict goes into the **same step-9 PR-level summary** as the review-body findings, under its own `## Conversation-tab comments` heading. Per-comment fingerprints join the fenced fingerprint block so future runs dedupe.
- If `activeIssueComments` is empty AND `reviewBodyComments` is empty (or all dedupe), skip the PR-level summary comment entirely in step 9.

### 7. Assess automated review bodies

For every entry in `reviewBodyComments`:

- Dedupe first: if its `fingerprint` already appears in any `priorBabysitSentinels[].body`, skip; already covered.
- Otherwise, READ THE BODY IN FULL. Automated reviewers (CodeRabbit, Mendral, etc.) pack findings into nested `<details>/<blockquote>` HTML with file paths, line ranges, and titles inline. Identify each individual finding the body contains.
- For each finding, **classify scope** (in / out) using the Scope subsection. For ranges like `12-14`, any overlap with changed diff lines on either side of the hunk is in scope; no overlap is out of scope unless one of the explicit escape-hatch signals applies.
- Pick a verdict per finding:
  - In-scope → Agree / Disagree / Already fixed (as with threads). If Agree, apply the fix.
  - Out-of-scope → apply the out-of-scope fix bar. Meets the bar → Agree and apply the fix, noting in the summary that it was fixed despite being out of scope. Does not meet the bar → **Defer**. A Deferred finding does not get its own top-level comment; it goes into the summary under the **Deferred (out of scope)** heading (see step 9).

The whole-body `fingerprint` (not per-finding) goes in the fenced fingerprint block at the end of the summary. If the review body later changes (new findings, edits), the fingerprint changes and the next pass will post the summary again. It's slightly noisier but never silently drops a new finding.

If `reviewBodyComments` is empty (or all entries dedupe), skip ONLY the review-body section of the summary in step 9. Still post thread replies for every non-Skip-reply thread from step 6a and handle issue comments per step 6b.

### 8. Commit and push (if any edits)

If steps 5, 6, or 7 modified any files, decide:

- **Which files are yours this pass.** The worktree may contain unrelated in-progress work. Only stage files this pass touched. If in doubt, run `git diff --name-only` and pick from that list deliberately.
- **A focused commit message.** Prefer something like `cb-babysit: <one-line what-changed>`; the project's commitlint expects conventional-commit form, so a `fix(core): ...` or `docs(core): ...` prefix is usually right.

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

For every thread assessed in step 6a that was NOT marked **Skip-reply** (i.e., one of Agree / Disagree / Already fixed / Defer):

```bash
bash scripts/postSentinelReply.sh "$THREAD_ID" "$BODY"
```

Skip-reply threads are left alone as the existing sentinel already covers them.

Body templates (the script appends the `addressed` sentinel if missing):

- **Agree**: `Addressed in <commit-url>. <one-line what-changed>.`
- **Disagree**: `Leaving current behavior. <reasoning>.`
- **Already fixed**: `Already handled by <commit-url-or-file:line>. <brief pointer>.`
- **Defer**: `Out of scope for this PR; this looks like follow-up work rather than something introduced or required by this change. <one-line rationale or pointer if useful>.\n\n<sub>🤖 <code>cb-babysit:followup v1 core@3.10.1</code></sub>`

For Defer replies, include the follow-up sentinel on its own line as shown. The script will append the `addressed` sentinel after it on its own line, so the final body ends with the follow-up sentinel followed by a blank line followed by the `addressed` sentinel. `grep cb-babysit:followup` finds the deferral and `grep cb-babysit:addressed` still marks the thread handled for dedupe.

The script uses the `addPullRequestReviewThreadReply` GraphQL mutation. It does NOT resolve the thread.

If any automated review bodies were assessed in step 7 OR any active issue comments were assessed in step 6b, post ONE top-level PR comment summarizing all of them:

```bash
bash scripts/postSentinelPrComment.sh "$PR_NUMBER" "$BODY"
```

The PR-level summary should:

- Group by source. Use `## Review-body findings` for step-7 work and `## Conversation-tab comments` for step-6b work. Omit a section if its list is empty.
- Inside each section, group verdicts under **Agree / Disagree / Already fixed / Deferred (out of scope)** subheadings. Omit a subheading if its list is empty.
- Under **Deferred (out of scope)**, list each deferred item as a bullet, followed on its own line by `<sub>🤖 <code>cb-babysit:followup v1 core@3.10.1</code></sub>` so grep catches them individually.
- Include the commit URL for fixes.
- End with a fenced fingerprint block listing every current fingerprint (addressed and deferred) one per line. Include both `reviewBodyComments[].fingerprint` (whole-body, one per automated review) and `activeIssueComments[].fingerprint` (per Conversation-tab comment). Future runs dedupe by matching these against `priorBabysitSentinels`.

### 10. Summarize

Report:

- Commits made (with URLs).
- Merge conflict status if relevant (resolved or aborted with reason).
- CI checks fixed / still failing / skipped-with-diagnosis.
- Review threads replied to, grouped by verdict (including any Defer count: "X threads deferred as follow-ups").
- Conversation-tab comments addressed, grouped by verdict (e.g. "Z conversation comments deferred as follow-ups").
- Review-body findings summarized (or skipped because already covered), including the Deferred count: "Y review-body findings deferred as follow-ups".
- Threads left active because of bot-acknowledgement uncertainty (flag by thread URL).
- If `truncated` is non-empty: explicitly call out which connection hit GitHub's 100-item GraphQL cap (e.g. "`truncated: ['thread-comments']`, at least one review thread has more than 100 comments; this pass may have missed the tail. Investigate before relying on it for completeness.").
- The stop condition triggered for this pass (clean / progressing / stuck).

When the report mentions any deferrals, include a one-liner the user can run later to enumerate them, e.g.:

```bash
gh api graphql -f query='query($o:String!,$r:String!,$n:Int!){repository(owner:$o,name:$r){pullRequest(number:$n){reviewThreads(first:100){nodes{comments(first:50){nodes{body url}}}}comments(first:100){nodes{body url}}}}}' -F o=<owner> -F r=<repo> -F n=<pr> | grep -B1 cb-babysit:followup
```

Do not rely only on `gh pr view --json comments,reviews`. That view can miss inline review-thread replies, which is where most Defer replies live.

## Loop control

After the single pass completes, pick exactly one outcome:

- **Exit clean**: all CI checks passed AND every thread in `activeThreads` was either marked Skip-reply during step 6a's inspection or has already received a fresh sentinel reply in this pass (Agree / Disagree / Already-fixed / **Defer** all count. A Defer reply is a sentinel reply), AND every entry in `activeIssueComments` is covered by this pass's PR-level summary, AND every current review-body fingerprint is covered by an existing sentinel comment (deferred review-body and conversation-comment fingerprints count; they're in the summary's fenced block). Do not use raw `totalActiveThreads` / `totalActiveIssueComments` from the script output. They're pre-inspection and will stay non-zero for Skip-reply or post-summary cases. A PR with Deferred items is still clean from babysit's perspective: the skill has done what it can without widening scope. Report success and stop.
- **Exit progressing**: pass made commits, posted new replies, or both, and the PR is not yet clean (CI is still pending, a new CI run was triggered by this pass's commits, or more work remains). There is real work still in flight that another run would pick up. Report what was done and what is pending, and tell the user to re-run `/cb-babysit` once CI settles, or to wrap the call with `/loop <cadence> /cb-babysit` (or a shell `while true; do ...; done`) for automatic re-runs.
- **Exit stuck**: pass made no commits and posted no new replies, and the PR is still not clean. Nothing actionable happened this pass. Use this whenever progress is blocked on something outside the skill's scope, including:
  - Merge conflict in step 2 that exceeded the high-confidence resolution bar.
  - CI still running (`gh pr checks --watch` timed out with pending checks).
  - CI failing with a diagnosis-only verdict from Step 5 (flaky / infra / auth / external check / ambiguous / out-of-scope failure).
  - Only Skip-reply threads remained AND CI was already red or pending.

  Report the specific blocker (pending vs. diagnosed-failure, with the diagnosis text) and tell the user to investigate or re-run once state may have changed.

This skill never waits or repeats internally.
