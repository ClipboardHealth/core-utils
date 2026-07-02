---
name: cb-review
description: Code review of the current branch or a PR — single-pass by default, parallel reviewer agents that debate at high effort, plus a spec-compliance lens when the originating ticket or PRD is available; findings posted as anchored PR comments. Use when the user asks to review a diff, branch, or PR, or runs /cb-review [pr-number-or-url] [--effort low|high].
argument-hint: "[pr-number-or-url] [--effort low|high] [--adversarial]"
---

# CB Review

Review a diff against one rubric, filter to the few findings worth raising, gate with the user, optionally post as anchored PR comments. Two engines share everything except how the rubric is applied:

- **low** — single pass by you (the main agent), no subagents. Default.
- **high** — parallel reviewer agents, one debate round, moderator filter. For large or high-stakes diffs.

## Invocation

- `/cb-review` — review the current branch (resolves the open PR for the branch if any, otherwise diffs against the default branch).
- `/cb-review <pr-number-or-url>` — review that PR without checking it out; forces reviewer mode. Accepts a bare number (current repo) or full GitHub URL (identifies owner/repo).
- `--effort low|high` — pick the engine explicitly. Phrases also select: "quick"/"fast" → low; "deep"/"thorough"/"multi-perspective" → high.
- `--adversarial` (or "with adversarial") — add the opt-in Adversarial lens (low) or agent (high).

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

**Persistence:** low effort holds everything in-context. High effort persists for subagents: diff → `/tmp/cb-review-diff.patch`, context → `/tmp/cb-review-context.md`, changed files → `/tmp/cb-review-files.txt`, metadata (PR number/url/base/author, viewer, head SHA, owner/repo, mode, `context_ref`, dispatched agent set) → `/tmp/cb-review-meta.json`.

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
2. `HEAD` differs from `origin/${base}` on Path A.
3. Working tree is dirty AND dirty paths overlap the diff's changed-file list or anything you'll need to read.
4. `HEAD` is behind `origin/${base}` (any non-zero "behind").
5. `HEAD` is more than a small number of commits ahead of `origin/${base}` on Path A.

Warn template (substitute verified state):

> Freshness check for `<owner>/<repo>` at `<worktree-path>`:
>
> - on branch `<HEAD-branch>` (expected `<base>` for Path A)
> - `<N>` ahead, `<M>` behind `origin/<base>` (last: `<short-sha> <iso-date>`)
> - working tree: `<clean | dirty: N file(s)>`
>
> Reading from this worktree may surface findings based on stale state.
> Reply: `proceed` (use worktree, accept the risk), `use-origin` (read context via `git show origin/<base>:<path>` — recommended), or `stop`.

**Never** run `git checkout`, `stash`, `reset`, or other state-modifying git on the user's behalf. The skill warns and asks; the user resolves local state. `git fetch` is allowed (read-only).

For Path A PR review when the worktree is dirty or on a non-base branch, fetch the PR head to a local ref instead:

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

A finding's evidence is "cross-repo" when its load-bearing claim depends on code in any repo other than the one containing the diff. **Never silently read external repos and never claim a downstream impact you have not verified** — speculating that "the FE will break" without reading the consumer is a top source of false-positive findings. Cap any cross-repo finding at **MAJOR** until verified.

Read [references/cross-repo-evidence.md](references/cross-repo-evidence.md) before raising or finalizing any cross-repo finding — it has when the policy fires, the verify-or-downgrade procedure, the access-request template, and what "verify" means for contract/schema vs API-response changes.

## Diff classification (pick which lenses apply)

Walk the changed-file list. Activate lenses that match:

- **Security** triggers on: `routes/`, `controllers/`, `middleware*/`, files matching `auth*`/`*permission*`/`*acl*`/`*token*`/`*session*`, response serializers, OpenAPI/contract definitions, new API endpoint files.
- **Database** triggers on: `migrations/`, `*.sql`, files matching `schema*`, Mongoose/Prisma model files (`models/`, `*.model.ts`, `*.schema.ts`), repository/DAL files, query builders.
- **Frontend** triggers on: `*.tsx`, `*.jsx`, `*.css`, `*.scss`, `pages/`, `components/`, `hooks/`, or anything importing from `react`, `@tanstack/react-query`, or a design-system package.
- **Spec** triggers when a spec source exists. Look in order: (1) issue/ticket references in the PR body or commit messages (`#123`, `Closes #45`, Linear/Jira keys) — fetch via `gh` or the tracker; (2) a path the user passed as an argument; (3) a plan/PRD file under `docs/`, `specs/`, or `.scratch/` matching the branch or feature name. Nothing found → skip the lens and note "no spec available" in Summary.

Always-on lenses: **Engineering**, **Minimalism**, **Conventions**, **AntiSlop**. Opt-in: **Adversarial** (only when the user asked — see Invocation).

## Review

The rubric — severity ladder, `failure_mode` contract, do-not-raise list, NIT gate, caps, `suggested_fix` schema, and every lens checklist — lives in [references/review-rubric.md](references/review-rubric.md). It is binding for both engines.

### Low effort

Read the full rubric, then walk the diff once, applying the active lenses yourself. You're looking for _the smallest number of high-signal findings_, not exhaustive coverage. **No subagents** — if a finding needs deeper independent investigation than you can do confidently in-line, surface it as a flagged finding rather than guess.

### High effort

Follow [references/multi-agent.md](references/multi-agent.md): dispatch one reviewer agent per active lens in parallel (each reads only its own rubric section), run one debate round, then moderator-filter. Return here for Synthesize.

## Filter (before synthesis)

Low effort: apply to your own candidates. High effort: the moderator filter in multi-agent.md extends this list — apply that version.

1. **Drop findings with empty or hypothetical `failure_mode`.** "A future caller might…", "in case someone…" → drop.
2. **Self-audit for slop.** For every finding, ask: does it match a slop pattern (asks-for-defensive-guard on an already-narrowed value — but only if an _enforced_ check narrows it, not merely a declared type or cast; hypothetical future caller; restating-obvious comment request; abstract refactor with no concrete cost-of-keeping; observability without named failure mode; test for trivially-verifiable code; defends against a state the product cannot produce)? If yes and you can't write a concrete, product-specific cost in one sentence — drop it.
3. **Cross-repo audit.** Does the failure_mode reference a downstream actor or a contract/schema/public-artifact boundary? If you didn't actually read the external code, route through the cross-repo evidence policy (verify, ask for access, or downgrade to a labeled "speculative" MINOR).
4. **Drop do-not-raise items** that slipped through.
5. **Apply the NIT gate.** NITs that don't meet it → drop. Kept NITs stay internal, hidden by default.
6. **Merge near-duplicates** under one finding (note which lens(es) surfaced it).
7. **Apply hard caps.** 6 actionable, 8 NITs retained; rest summarized as "N additional items omitted; ask for the full list."

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

## User gate 1 — select items

Ask via the host's structured picker (`AskUserQuestion` in Claude Code; hosts without one: a numbered text prompt with the same options). Render each actionable finding as an option, plus a trailing "Show the N NIT(s) first" option when N > 0. Set `multiSelect: true`. Do not proceed until the user answers.

Option-label format: `<id> - <short title> (<SEVERITY>)`. The `description` is the one-sentence failure_mode, not the fix.

- **Zero findings selected** → end with a one-line "no findings selected — nothing to do".
- **Only "Show the N NIT(s) first"** → print the NITs (one-liners with `file:lines` and `[CONVENTION]`/`[SPEC]` tags), then re-ask this gate.
- **Findings selected** → proceed to gate 2 (print NITs first if the toggle was also checked).

## Branch on mode

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

## Rules

- The rubric file is binding for both engines: empty `failure_mode` → drop, NIT not meeting the gate → drop, do-not-raise items → drop, caps applied (6 actionable, 8 nits).
- Issue independent `gh`/`git` commands in parallel (PR view, diff, files, viewer).
- Freshness preflight is mandatory before reading code. Read repo context via `git show "<context_ref>:<path>"`, not the worktree filesystem, unless `context_ref = worktree (stale, user accepted risk)`.
- Never run state-modifying git commands on the user's behalf (`checkout`, `stash`, `reset`, `clean`, `pull` with merge). Warn and ask. `git fetch` is allowed.
- Cross-repo evidence: **never raise a "consumer will break" finding without reading the consumer.** Cap at MAJOR until verified; user `skip` → drop or keep as MINOR with a visible "speculative — assumes `<X>`" prefix.
- Conditional lenses (Security/Database/Frontend/Spec) run only when classification matches. Adversarial runs only on explicit opt-in; surface the on/off decision in one line before reviewing so the user can see what ran.
- Hide nits by default. Print only when the user selects the NIT toggle in gate 1.
- Reviews are always `event: COMMENT`. Never approve or request changes on the user's behalf.
- Both user gates are mandatory. Do not auto-apply recommendations and do not auto-post reviews.
- If the diff is empty, stop with a one-line message — do not invent findings.
