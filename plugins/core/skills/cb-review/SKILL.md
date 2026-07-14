---
name: cb-review
description: Code review of a diff, branch, or PR, with findings posted as anchored PR comments. Use when the user asks to review a diff, branch, or PR, asks to check a change against its ticket/spec/PRD, or runs /cb-review [pr-number-or-url] [--effort low|high] [--report] [--spec-context <path-or-reference-or-text>].
argument-hint: "[pr-number-or-url] [--effort low|high] [--report] [--spec-context <path-or-reference-or-text>]"
---

# CB Review

Review a diff against one rubric, filter to the few findings worth raising, gate with the user, optionally post as anchored PR comments. `--report` replaces the gates with a findings report for an agent caller. Two engines share everything except how the rubric is applied:

- **low** — one reviewer subagent, single pass. Default.
- **high** — parallel reviewer subagents, one debate round, moderator filter. For large or high-stakes diffs.

## Invocation

- `/cb-review` — review the current branch (resolves the open PR for the branch if any, otherwise diffs against the default branch).
- `/cb-review <pr-number-or-url>` — review that PR without checking it out; forces reviewer mode. Accepts a bare number (current repo) or full GitHub URL (identifies owner/repo).
- `--effort low|high` — pick the engine explicitly. Phrases also select: "quick"/"fast" → low; "deep"/"thorough"/"multi-perspective" → high.
- `--report` — non-interactive: stop after Synthesize and return the findings to the caller. No user gates, no posting, no implementing. For agent callers (e.g. cb-ship's review step).
- `--spec-context <path-or-reference-or-text>` — use the value only as the originating source of truth, never as the PR selector. Read a local path in full, fetch a ticket or spec reference, or preserve natural-language text verbatim. Use the resolved content for the Spec lens instead of reconstructing intent from commit or PR prose.

**Effort auto-select** (no flag, no phrase): `high` when the diff exceeds 20 changed files or 600 changed lines, else `low`. Before reviewing, print one line — `Effort: <low|high> (<N> files, <M> lines; override with --effort <other>)` — so the user can interrupt.

## Scope

### Path A — PR-argument fast path (argument provided)

- Parse the argument: bare integer → `gh repo view --json nameWithOwner --jq .nameWithOwner`; URL → extract `<owner>/<repo>` and `<N>`.
- Do **not** check out the PR branch.
- Mode is **locked to reviewer**.

Gather in parallel:

```bash
gh pr view <N> --repo <owner>/<repo> --json number,url,title,body,baseRefName,author,headRefOid,files
gh pr diff <N> --repo <owner>/<repo>
gh api user --jq .login
```

If `pr.author.login == viewer.login`, still proceed in reviewer mode but flag this in Summary so the user can switch to a current-branch run on their checkout if they meant to implement.

### Path B — current-branch path (no argument)

- Open PR for current branch → review that PR. Base = `baseRefName`, diff = `git diff $base...HEAD`. Context = PR title + body.
- No PR → diff vs default branch (`main`, fall back to `master`). Context = `git log --format='%h %s%n%n%b' $base..HEAD`.
- **Never** review uncommitted working-tree changes. Empty diff → stop and report.

Determine **mode**:

- PR exists and `pr.author.login == viewer.login` → **author mode**.
- PR exists and authors differ → **reviewer mode**.
- No PR → **author mode**.

**Persistence:** both efforts persist for subagents into a fresh per-run directory — `RUN_DIR=$(mktemp -d "${TMPDIR:-/tmp}/cb-review.XXXXXX")` — so concurrent sessions never clobber each other: diff → `$RUN_DIR/diff.patch`, context → `$RUN_DIR/context.md`, changed files → `$RUN_DIR/files.txt`, metadata (PR number/url/base/author, viewer, head SHA, owner/repo, mode, `context_ref`, `spec_source`) → `$RUN_DIR/meta.json`.

When the caller supplied source-of-truth context, include it verbatim in `$RUN_DIR/context.md` and set `spec_source` so every dispatched reviewer uses it.

## Freshness preflight (mandatory before reading code)

Stale local state produces false-positive findings. Before reviewing, verify the ref you'll read for context is current.

Run on the **primary repo** (the one containing the diff):

```bash
git fetch origin "$base" --quiet
git rev-parse --abbrev-ref HEAD
git status --porcelain
git rev-list --left-right --count "HEAD...origin/${base}"
git log -1 --format='%h %ci' "origin/${base}"
```

Decide `context_ref`:

- **Path A (reviewer):** `context_ref = origin/${base}`. The worktree may be used only when `HEAD == origin/${base}` AND clean AND fetch succeeded.
- **Path B (author):** `context_ref = origin/${base}`. The local feature branch IS the diff; pre-PR context comes from `origin/${base}`.

Stop and ask the user when:

1. `git fetch` failed (offline, auth).
2. Path B: working tree is dirty AND dirty paths overlap the diff's changed-file list or anything you'll need to read.
3. Path B: `HEAD` is behind `origin/${base}` (any non-zero "behind") — findings may target code the base has already changed.

Warn template (substitute verified state):

> Freshness check for `<owner>/<repo>` at `<worktree-path>`:
>
> - on branch `<HEAD-branch>`
> - `<N>` ahead, `<M>` behind `origin/<base>` (last: `<short-sha> <iso-date>`)
> - working tree: `<clean | dirty: N file(s)>`
>
> Reading from this worktree may surface findings based on stale state.
> Reply: `proceed` (use worktree, accept the risk), `use-origin` (read context via `git show origin/<base>:<path>` — recommended), or `stop`.

**Never** run `git checkout`, `stash`, `reset`, or other state-modifying git on the user's behalf. The skill warns and asks; the user resolves local state. `git fetch` is allowed (read-only).

On Path A, local branch state never blocks the review — all reads go through origin refs, no checkout needed. When `HEAD` differs from `origin/${base}` or the tree is dirty, fetch the PR head to a local ref:

```bash
git fetch origin "pull/<N>/head:refs/remotes/origin/pr-<N>" --quiet
```

Then read PR-head content via `git show origin/pr-<N>:<path>` and base context via `git show origin/<base>:<path>`. No checkout needed.

### Reading code

When `context_ref = origin/<base>` (or `origin/pr-<N>` for PR head):

- Read via `git show "${context_ref}:<path>"` (whole files) or `git grep -n <pattern> "${context_ref}" -- <paths>` (search).
- Avoid reading the worktree filesystem for tracked content — it may be stale.
- Worktree reads are OK only for files brand-new in the diff (untracked at `context_ref`); note "verified against: worktree" in the finding.

When `context_ref = worktree (stale, user accepted risk)`:

- Worktree reads are OK but every CRITICAL/MAJOR finding is downgraded to MINOR unless evidence is internal to the diff itself. Tag each finding with "verified against: worktree-stale".

## Cross-repo evidence policy

A finding's evidence is "cross-repo" when its load-bearing claim depends on code in any repo other than the one containing the diff. Read [references/cross-repo-evidence.md](references/cross-repo-evidence.md) before raising or finalizing any cross-repo finding — it has when the policy fires, the verify-or-downgrade procedure, the severity cap, the access-request template, and what "verify" means for contract/schema vs API-response changes.

## Diff classification (pick which lenses apply)

Walk the changed-file list. Activate lenses that match:

- **Security** triggers on: `routes/`, `controllers/`, `middleware*/`, files matching `auth*`/`*permission*`/`*acl*`/`*token*`/`*session*`, response serializers, OpenAPI/contract definitions, new API endpoint files.
- **Database** triggers on: `migrations/`, `*.sql`, files matching `schema*`, Mongoose/Prisma model files (`models/`, `*.model.ts`, `*.schema.ts`), repository/DAL files, query builders.
- **Frontend** triggers on: `*.tsx`, `*.jsx`, `*.css`, `*.scss`, `pages/`, `components/`, `hooks/`, or anything importing from `react`, `@tanstack/react-query`, or a design-system package.
- **Spec** triggers when a spec source exists. Look in order: (1) source-of-truth context supplied by the caller; (2) issue/ticket references in the PR body or commit messages (`#123`, `Closes #45`, Linear/Jira keys) — fetch via `gh` or the tracker; (3) a plan/PRD file under `docs/`, `specs/`, or `.scratch/` matching the branch or feature name. Nothing found → skip the lens and note "no spec available" in Summary.

Always-on lenses: **Engineering**, **Minimalism**, **Conventions**, **AntiSlop**.

## Review

The rubric — severity ladder, `failure_mode` contract, do-not-raise list, NIT gate, caps, `suggested_fix` schema, and every lens checklist — lives in [references/review-rubric.md](references/review-rubric.md). It is binding for both engines.

### Low effort

Dispatch **one** reviewer subagent — fresh eyes on the diff, and the bulk content stays out of your context. Its prompt carries the persisted file paths, the absolute path to references/review-rubric.md with the instruction to read it in full, the active lens list, the spec source when the Spec lens is active, and the two contracts from multi-agent.md §Dispatch mechanics (context-read, cross-repo evidence) with `<context_ref>` substituted and the moderator/Round-2 sentence replaced by: emit `evidence_required` findings capped at MAJOR; the dispatching agent resolves them in the Filter's cross-repo audit. Finding ids use an `R` prefix in place of roster letters. The subagent walks the diff, applying every active lens — the walk is done only when every hunk has been read under each active lens. Exhaustive reading, selective output: it returns _the smallest number of high-signal findings_ in the Round 1 output shape (multi-agent.md §Round 1), flagging anything that needs deeper investigation than it can do confidently rather than guessing. If the host cannot run subagents, do that same single pass yourself inline.

### High effort

Follow [references/multi-agent.md](references/multi-agent.md): dispatch one reviewer agent per active lens in parallel (each reads only its own rubric section), run one debate round, then moderator-filter. Return here for Synthesize.

## Filter (before synthesis)

Low effort: apply to the reviewer subagent's candidates. High effort: the moderator filter in multi-agent.md extends this list — apply that version.

1. **Drop findings with empty or hypothetical `failure_mode`.** "A future caller might…", "in case someone…" → drop.
2. **Drop do-not-raise matches.** For every finding, ask: does it match a do-not-raise item (rubric §Admission)? If it matches a `slop:` tag and you can't write a concrete, product-specific cost in one sentence — drop it.
3. **Cross-repo audit.** Does the failure_mode reference a downstream actor or a contract/schema/public-artifact boundary you didn't actually read? Route through the cross-repo evidence policy.
4. **Apply the NIT gate.** NITs that don't meet it → drop. Kept NITs stay internal, hidden by default.
5. **Merge near-duplicates** under one finding (note which lens(es) surfaced it).
6. **Apply hard caps.** 6 actionable, 8 NITs retained; rest summarized as "N additional items omitted; ask for the full list."

Track dropped items in Withdrawn (one-liner each) so the user can see what was filtered.

## Synthesize

### Summary

One short paragraph: what the change does and your overall recommendation (ship / ship with changes / do not ship). When the Spec lens ran, add one line with its verdict — requirements met, missing, or diverging — kept separate so a standards-clean diff can't mask a spec miss (and vice versa). When it was skipped, add "no spec available". Do not state the mode, engine, lenses applied, or convention sources consulted — that metadata is noise.

### Actionable

Up to 6 items. Format each:

- **[SEVERITY] Title** — `file:lines`
- **Point:** one sentence. Spec findings quote the spec line they're grounded in.
- **Why it matters:** the `failure_mode`.
- **Suggested fix (before → after):** two stacked fenced code blocks — first `// Before` (current code), then `// After` (replacement). Same language tag for both. For a pure deletion, show only `Before` and write "_Delete these lines._" For a pure addition, show only `After` prefixed with `// Add after line <N>`. Omit when structural; explain in prose.
- **Lens(es):** which lens(es) surfaced this (high effort: which agents raised/agreed, by name).

Order by severity (CRITICAL → MAJOR → MINOR), then by file. Number items 1..N — these ids drive the gates.

### Disagreements (high effort only)

Items where agents substantively disagreed and did not converge. One sentence per side, attributed by agent name, then the moderator's call with a one-line reason.

### Nits

Do **not** print by default. Print only: _"N nit(s) available (M from convention audit)."_ Surface a "show the N NIT(s) first" option in gate 1. If N is 0, omit this section.

### Withdrawn

Terse one-liners of items dropped by the filter. Transparency only.

## Report mode (--report)

Stop after Synthesize: print the Summary, the Actionable list, and the retained NITs as one-liners (the caller is an agent — the hide-nits default is for humans), then end. No user gates, no posting, no implementing; the caller triages every finding itself and owns any fixes.

Earlier interactive checkpoints resolve to their safe defaults instead of prompting: the freshness preflight's stop-and-ask resolves as `use-origin` (fetch failure → return an error to the caller instead of findings), and cross-repo access requests resolve as `skip all` (downgrade per the cross-repo policy).

## User gate 1 — select items

Ask via the host's structured picker (`AskUserQuestion` in Claude Code; hosts without one: a numbered text prompt with the same options). Render each actionable finding as an option, plus a trailing "Show the N NIT(s) first" option when N > 0. Set `multiSelect: true`. Do not proceed until the user answers.

Option-label format: `<id> - <short title> (<SEVERITY>)`. The `description` is the one-sentence failure_mode, not the fix.

- **Zero findings selected** → end with a one-line "no findings selected — nothing to do".
- **Only "Show the N NIT(s) first"** → print the NITs (one-liners with `file:lines` and `[CONVENTION]`/`[SPEC]` tags), then re-ask this gate.
- **Findings selected** → proceed to gate 2 (print NITs first if the toggle was also checked).

## Branch on mode

Gate 2 is mandatory in both modes — never auto-apply fixes and never auto-post reviews.

### Author mode

**Plan.** For the selected ids only, produce an ordered implementation plan: steps, files touched per step, tests to add/update, verification commands. Do **not** edit files yet.

**User gate 2 (author)** — structured picker, `multiSelect: false`, options:

- `Implement locally` — apply the plan against the checkout.
- `Post as review` — post anchored comments on your own PR, then stop.
- `Both` — post the review first, then execute the plan.
- `Edit the plan` — revise, re-ask this gate.
- `Cancel` — stop.

**Execute.** Track each step with the host's task tracker. Apply the plan, run verification, report results. If a step surfaces a new substantive issue not in the selected items, stop and ask before expanding scope.

### Reviewer mode

Skip the plan step — you are not implementing someone else's code.

**User gate 2 (reviewer)** — structured picker, `multiSelect: false`, options:

- `Post` — submit a single COMMENT review with the selected anchored comments.
- `Edit` — ask which to drop or refine, then re-ask.
- `Cancel` — stop.

## Posting an anchored PR review (both modes)

When the user approves items to post, submit a **single** review via the GitHub Reviews API (`event: COMMENT` — never `APPROVE`/`REQUEST_CHANGES`), with every selected item as an inline comment anchored to its diff line. Never use loose issue comments.

Follow [references/posting-pr-review.md](references/posting-pr-review.md) exactly — it has the `gh api` call, the payload shape, the three-block review body, and the per-comment body budget and format. After posting, print the review `html_url` and a one-line summary of how many comments were posted (and fallback general-notes count if any).
