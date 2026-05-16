---
name: simple-review
description: Run a single-pass code review on the current branch or a PR, using the in-depth review rubric without subagents.
---

# Simple Review

Single-pass code review you (the main agent) perform yourself — **no subagents**. Condenses the rules from `/in-depth-review` into one checklist you walk through directly. Use this for small/medium PRs and when budget matters. Use `/in-depth-review` instead when the diff is large, high-stakes, or benefits from independent perspectives that can debate.

## Invocation

- **`/simple-review`** — review the current branch (resolves the open PR for the branch if any, otherwise diffs against the default branch).
- **`/simple-review <PR-number-or-URL>`** — fast path for reviewing someone else's PR while sitting on `main` (typical entry from a worktree). Skips local branch checkout, fetches diff/metadata via `gh`, forces **reviewer mode**, skips the plan/execute path. Accepts a bare number (current repo) or full GitHub URL (identifies owner/repo).

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

If `pr.author.login == viewer.login`, still proceed in reviewer mode but flag this in Summary so the user can switch to a manual `/simple-review` run on their checkout if they meant to implement.

### Path B — current-branch path (no argument)

- Open PR for current branch → review that PR. Base = `baseRefName`, diff = `git diff $base...HEAD`. Context = PR title + body.
- No PR → diff vs default branch (`main`, fall back to `master`). Context = `git log --format='%h %s%n%n%b' $base..HEAD`.
- **Never** review uncommitted working-tree changes. Empty diff → stop and report.

Determine **mode**:

- PR exists and `pr.author.login == viewer.login` → **author mode**.
- PR exists and authors differ → **reviewer mode**.
- No PR → **author mode**.

You hold everything in-context — no `/tmp/*` persistence needed.

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

- **Path A (reviewer):** `context_ref = origin/${base}` (usually `main`). Worktree may be used only when `HEAD == origin/${base}` AND clean AND fetch succeeded.
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

For Path A PR review when the worktree is dirty or on a non-base branch, the practical workaround is to fetch the PR head to a local ref:

```bash
git fetch origin "pull/<N>/head:refs/remotes/origin/pr-<N>" --quiet
```

Then read PR-head content via `git show origin/pr-<N>:<path>` and base context via `git show origin/<base>:<path>`. No checkout needed.

### Reading code

When `context_ref = origin/<base>` (or `origin/pr-<N>` for PR head):

- Read via `git show "${context_ref}:<path>"` (whole files) or `git grep -n <pattern> "${context_ref}" -- <paths>` (search).
- Avoid the Read tool on the worktree filesystem for tracked content — it may be stale.
- Worktree Read is OK only for files brand-new in the diff (untracked at `context_ref`); note "verified against: worktree" in the finding.

When `context_ref = worktree (stale, user accepted risk)`:

- Read tool is OK but every CRITICAL/MAJOR finding is downgraded to MINOR unless evidence is internal to the diff itself. Tag each finding with "verified against: worktree-stale".

## Cross-repo evidence policy

A finding's evidence is "cross-repo" when it depends on code in any repo other than the one containing the diff. **Never silently read external repos** — they may be stale or you may have no checkout at all.

When a finding's load-bearing evidence is in another repo:

- Tag the finding with `evidence_required: { repos, what_to_verify }` in your notes.
- Cap severity at MAJOR until verified.
- Ask the user before treating it as load-bearing:

  > Some findings depend on code outside `<primary-repo>`. To verify, I need access to:
  >
  > - `<repo-1>` — to check `<what_to_verify>`
  >
  > For each: a local path (I'll run freshness preflight), `gh:<owner>/<repo>` (I'll fetch via `gh api repos/<owner>/<repo>/contents/<path>?ref=main`), or `skip` (downgrade to MINOR with "speculative" prefix).
  > Or `skip all` to downgrade every cross-repo finding.

For each user-provided local path, run the **same freshness preflight**. Read external code via `git show "${external_context_ref}:<path>"`, never via worktree filesystem. `skip` → cap at MINOR with "speculative" prefix.

## Diff classification (pick which lenses apply)

Walk the changed-file list. Activate lenses that match:

- **Security lens** triggers on: `routes/`, `controllers/`, `middleware*/`, files matching `auth*`/`*permission*`/`*acl*`/`*token*`/`*session*`, response serializers, OpenAPI/contract definitions, new API endpoint files.
- **Database lens** triggers on: `migrations/`, `*.sql`, files matching `schema*`, Mongoose/Prisma model files (`models/`, `*.model.ts`, `*.schema.ts`), repository/DAL files, query builders.
- **Frontend lens** triggers on: `*.tsx`, `*.jsx`, `*.css`, `*.scss`, `pages/`, `components/`, `hooks/`, or anything importing from `react`, `@tanstack/react-query`, or a design-system package.

Always-on lenses: **Engineering**, **Minimalism**, **Conventions**, **AntiSlop**.

## Severity rubric (binding)

- **CRITICAL** — realistic input causes incorrect behavior, data loss, security regression, broken contract, or a paging incident.
- **MAJOR** — meaningful degradation of correctness/UX/observability under realistic conditions; OR a documented-convention violation with concrete downstream impact.
- **MINOR** — cheap, concrete improvement with a named benefit.
- **NIT** — only admissible if (a) repeats ≥2× in the diff, (b) conflicts with a documented convention, or (c) is a one-line trivial fix.

Every finding **must** include a `failure_mode`: one sentence on the concrete user-, oncall-, or maintainer-visible bad outcome that would occur if not fixed. Hypotheticals like "a future caller might…" do **NOT** satisfy this — drop the finding.

### Do-not-raise list (binding)

- Speculative defensiveness at trusted internal boundaries.
- Restating the obvious ("consider a comment explaining what this does").
- Hypothetical future-caller scenarios with no current caller.
- Style/formatting a linter or formatter covers.
- Test-coverage demands on trivially-verifiable code.
- "Add observability" without naming a concrete failure mode it would help debug.
- Abstract SOLID-style "consider extracting…" without a concrete failure mode.
- Aesthetic naming preferences — only raise names that mislead about behavior.

## Review checklist

Walk the diff once. For each lens, you're looking for _the smallest number of high-signal findings_, not exhaustive coverage. Cap **6 actionable items** (CRITICAL/MAJOR/MINOR) plus **8 nits** retained internally; anything beyond is "N additional items omitted; ask for the full list."

For every candidate finding, run the litmus test before keeping it: _"What is the concrete, current, product-visible cost of leaving this code in?"_ If you can't answer in one sentence, drop it.

### Engineering (always)

For each change name a realistic input or condition that would expose a bug. If you cannot, do not raise it.

- Edge cases, error paths, observability of real failure modes.
- Tests cover real risk, not lines.
- Concurrency, performance at real scale, data integrity.
- Backward compatibility, on-call implications, degraded-mode behavior.
- Async/await ordering matches actual data dependencies.
- Timezone correctness in date code; currency variables explicitly in minor units.
- API surface changed → AuthN/AuthZ/PII (deep dive under Security).
- Migration → rollback, rolling-deploy compat, ETL/downstream impact (deep dive under Database).
- Schema/query changed → indexes for new patterns, N+1, cascade semantics, type fit (deep dive under Database).
- Telemetry covers business/product value, not only engineering surface metrics.
- Contract/backward-compat for any consumer-visible response shape change.

### Minimalism (always)

The smallest diff that ships the intent is the best diff.

- Unneeded abstractions, speculative generality, dead branches.
- Redundant validation, defensive code at trusted internal boundaries.
- Comments that restate code; new files/utilities that duplicate existing ones.
- Tests that exercise the framework, not behavior.
- Flags/config knobs without a concrete caller.
- Duplicated error handlers in the same scope.
- Commented-out code or dead branches.

For every "delete this" finding, `failure_mode` must state the **concrete cost of keeping the code**.

### Conventions (always)

You are the convention owner — read the repo's actual conventions before flagging anything. Consult, in order of priority:

- `git show ${context_ref}:AGENTS.md` and `CLAUDE.md` (if present)
- `git ls-tree -r --name-only ${context_ref} -- .rules` then read each rule file relevant to the diff
- Neighboring files in the same module/service for in-practice patterns
- Package READMEs in the touched paths

Check the diff for (only what's actually documented in the consulted sources):

- Preferred internal packages over third-party (`@clipboard-health/*`, internal `lib/*`).
- Terminology rules (worker/workplace, not HCP/facility).
- `lodash` removal preference.
- `@clipboard-health/datetime` over `date-fns`/`date-fns-tz`/`moment`/`luxon`.
- Internal `Money` package for currencies; explicit minor-units variable names.
- Logging conventions (`longContext`, `ObjectId.toString()`, no variables in log messages).
- Null/undefined checks via `isDefined`/`isNil` over truthy.
- 4+ argument functions → params object.
- Error-handling patterns in the same service (typed `ServiceResult` vs throw).
- Test conventions, naming, file location (service test structure, `createTestContext`/`tearDown`, `beforeAll/afterAll` for GET).
- Business-meaningful magic constants that should be named.
- ENV access via Configuration abstraction, not direct `process.env`.
- Logging library standard for the repo — derive from existing code, not hardcoded.
- Pinned dependencies; lock file in sync with `package.json`.
- RESTful route shape and uniform response format within a service.
- **Internal inconsistency within the diff itself** (e.g. half of imports from one package family, half from upstream; same persisted shape written three different ways across three call sites).

Frontend conventions are the Frontend lens's job when activated. If FE lens isn't active (no FE files), surface FE convention drift here only if it appears.

Tag every convention finding with `[CONVENTION]` in the title. Cap severity at MAJOR (only when behavior diverges as a result) or MINOR otherwise. In the Summary, list the convention sources you consulted.

### AntiSlop (always)

This PR may have been written or assisted by an LLM. For each addition, ask: _"Is this line earning its keep, or is it pattern-matching what code is supposed to look like?"_ Push back on what other lenses are too polite to flag. Apply to additions **inside the diff itself**.

- **Defensive code at trusted internal boundaries.** Null guards on private helpers whose callers' types guarantee non-null; `try`/`catch` wrapping a single non-throwing call, or that re-throws unchanged, or that "logs and swallows" without naming what to do next; optional-chaining through types that don't include optionality.
- **Defensiveness against unrealistic product scenarios.** Litmus: _"In the real product flow this code participates in, what user action / system event / upstream call could land us in this branch?"_ If the answer is "none" or "I had to invent one to justify the guard", it's slop. Concrete shapes:
  - Null/undefined guard on an ID immediately after that ID was used to load (and find) the entity.
  - A `null`/`undefined`/`""`/`0` branch on a field whose TypeScript or Zod/class-validator already rejects those.
  - Re-validation of a value the request DTO already validated upstream in the same lifecycle.
  - Consistency check (`if (a !== b) throw`) between two fields the data model forbids being unequal.
  - Branch for a product-impossible state.
  - Retry/fallback around an SDK call that already retries or returns a typed error.
  - `catch` for an error class statically known not to throw, or that logs+swallows.
  - "Future-proof" code path with no current `v2`.
- **Restating-the-code comments.** `// fetch the user`, JSDoc on private helpers that only restates the signature, `// Note: this is important`, section banners in short files.
- **Empty scaffolding.** `// TODO` with no owner/ticket; redundant pre-conditions; debug logs that survived to the PR; default `else { return undefined; }` after exhaustive branching; `_unused` prefixes that should be deletions.
- **Speculative generality.** Helper called once that wraps two trivial lines; `Map`/`Set`/config keyed by a single hardcoded value; "strategy"/"registry" pattern with one strategy; union types whose only second case is `never`/placeholder.
- **Unused parameters/overloads/fields.** Args destructured but never read; interface methods with empty implementations; new optional fields with no producer or consumer.
- **Tests that exercise the framework, not the code.** `jest.fn().mockReturnValue(x); expect(fn()).toBe(x)`; snapshot tests with no semantic assertion; tests that mock the unit under test; test names that describe the implementation (`it("calls foo.bar"…)`) instead of behavior.
- **Dead AI breadcrumbs.** Variables whose only use is logging or debug branches; `console.log`/`console.error` that should have been removed before commit; commented-out alternative implementations.
- **Tone/description mismatch.** PR description claims behavior the diff doesn't have; variable/function names that pattern-match engineering writing without naming the role (`data`, `result`, `processed`, `_handle`, `doStuff`).

Default `suggested_fix` is **delete** (empty `after`) or **simplify** (smaller `after`). Suggesting "add a justifying comment" is itself slop — do not propose it.

### Security lens (when triggered)

Where could this change leak data, bypass authorization, or expand the trust boundary?

- AuthN: every new/modified endpoint has authenticated identity unless explicitly public.
- AuthZ: per-endpoint AND per-resource permission checks; cross-tenant/cross-user access.
- Secrets in configuration — no hardcoded keys, no secrets in client bundles.
- No self-made or client-side cryptography.
- SQL/NoSQL injection: string-concatenated queries, unvalidated `$where`, raw aggregation pipelines from user input.
- Sensitive data in response payloads — over-fetching, over-serialization, internal IDs leaked.
- PII fields logged, cached, or sent to telemetry.
- Input validation at the boundary (Zod / class-validator) on every new endpoint.
- For numeric inputs: explicit `min`/`max` bounds. Verify what the JS engine does with `Number.MAX_SAFE_INTEGER + 1`, BigInt conversion, negative values, and whether the catch path returns a structured 400 or a 500 with stack log.

### Database lens (when triggered)

What breaks at production scale or during deploy?

- Index coverage for new query patterns; missing compound indexes.
- N+1 query shapes; loops issuing per-iteration queries.
- Schema normalization — denormalization that creates write-amplification or update anomalies.
- Data types — range, precision, locale (numeric, date, money). Mongoose `Number` is IEEE 754 double; safe for integers up to 2^53.
- Cascade-delete and FK-on-delete semantics; orphan risk.
- Migration rollback strategy; online without downtime.
- Backward compatibility during a rolling deploy (old code reads new schema; new code reads old schema).
- ETL / downstream consumer impact when schema or field semantics change.
- New collections / tables ship with the indexes their query patterns need on day one.
- **Dual-write fields** (storing both `amount` and `amountInMinorUnits`-style pairs): is canonicalization happening on write, or does the on-disk record encode two contradictory values?
- Backfill for new fields on existing records: present, deferred (with ticket), or missing?

### Frontend lens (when triggered)

Does this follow our FE conventions, and will it behave correctly under realistic user conditions?

- API calls through v2 / custom hooks, not raw `fetch`/`axios` in components.
- React Query: thin wrappers (`useGetQuery`, etc.), not raw `useQuery`/`useMutation`.
- Falsy checks via `isDefined()`/`isNil()`, not `!value`.
- Test actions wrapped in `act()`.
- Zod: `z.nativeEnum` when a TS enum already exists.
- Prop drilling — when a value passes through ≥2 layers, consider context.
- Feature flags via `useCbhFlag` (or repo equivalent), not direct config reads.
- New components/styles from the design-system library, not built from scratch.
- Loading / empty / error states for any new data-fetching surface.
- Accessibility: keyboard navigation, ARIA roles, labels on interactive controls.

## Self-filter (before synthesis)

After walking the checklist, apply these filters to your candidate findings:

1. **Drop findings with empty or hypothetical `failure_mode`.** "A future caller might…", "in case someone…" → drop.
2. **Self-audit for slop.** For every finding you wrote, ask: does it match a slop pattern (asks-for-defensive-guard on already-narrowed value; hypothetical future caller; restating-obvious comment request; abstract refactor with no concrete cost-of-keeping; observability without named failure mode; test for trivially-verifiable code; defends against a state the product cannot produce)? If yes and you can't write a concrete, product-specific cost in one sentence — drop it. Being your own AntiSlop reviewer is the main lever for keeping this skill honest.
3. **Drop do-not-raise items** that slipped through.
4. **Apply the NIT gate.** NITs that don't meet (a)/(b)/(c) → drop. Kept internally but hidden by default in synthesis.
5. **Merge near-duplicates** under one finding (note which lens(es) surfaced it).
6. **Apply hard caps.** 6 actionable, 8 NITs retained, rest summarized as "N additional items omitted".

Track dropped items in a Withdrawn section (one-liner each) so the user can see what was filtered.

## suggested_fix schema (when present)

```json
"suggested_fix": {
  "before": "<exact current code at file:lines>",
  "after":  "<replacement code at the same anchor>"
}
```

- Pure deletion: `after` is `""`.
- Pure addition at a new line: `before` is `""`, prefix `after` with `// add after line <N>`.
- Structural change with no clean drop-in: omit `suggested_fix`, describe in `point`/`failure_mode`.
- Both must be code (not prose), preserving the file's indentation. Don't elide with `// ...`.

## Synthesize

### Summary

One short paragraph: what the change does and your overall recommendation (ship / ship with changes / do not ship). Do not state the mode, list the lenses you applied, or list the convention sources you consulted — that metadata is noise for the user. Keep it to substance.

### Actionable

Up to 6 items. Format each:

- **[SEVERITY] Title** — `file:lines`
- **Point:** one sentence.
- **Why it matters:** the `failure_mode`.
- **Suggested fix (before → after):** two stacked fenced code blocks — first `// Before` (current code), then `// After` (replacement). Same language tag for both. For a pure deletion, show only `Before` and write "_Delete these lines._" For a pure addition, show only `After` prefixed with `// Add after line <N>`. Omit when structural; explain in prose.
- **Lens(es):** which lens(es) surfaced this (e.g. `Engineering, AntiSlop`).

Render template:

````
**Suggested fix (before → after):**

```ts
// Before — src/foo/bar.ts:42-45
const x = doThing();
if (x !== null) {
  return x;
}
```

```ts
// After
const x = doThing();
return isDefined(x) ? x : undefined;
```
````

Order by severity (CRITICAL → MAJOR → MINOR), then by file.

### Nits

Do **not** print by default. Print only: _"N nits available (M from convention audit). Reply `show nits` to see them."_ If N is 0, omit. When user replies `show nits`, print one-liners with `file:lines` and `[CONVENTION]` tag where applicable, then re-prompt user gate 1.

### Withdrawn

Terse one-liners of items you dropped (do-not-raise, NIT gate, self-slop audit). Transparency only.

## User gate 1 — select items

Ask exactly: _"Which items do you want to act on? Reply with ids (e.g. `1, 3`), `all actionable`, `show nits`, or `none`."_ Do not proceed until the user answers. `none` ends the skill. `show nits` prints the hidden list, then re-asks.

## Branch on mode

### Author mode

**Plan.** For the selected ids only, produce an ordered implementation plan: steps, files touched per step, tests to add/update, verification commands. Do **not** edit files yet.

**User gate 2 (author):** _"What do you want to do? (`implement-locally` / `post-as-review` / `both` / `edit-plan` / `cancel`)"_

- `implement-locally` → execute the plan.
- `post-as-review` → post anchored review (below); skill ends.
- `both` → post review first, then execute.
- `edit-plan` → revise, re-prompt.
- `cancel` → stop.

**Execute.** Use TodoWrite to track each step. Apply the plan, run verification, report results. If a step surfaces a new substantive issue not in the selected items, stop and ask before expanding scope.

### Reviewer mode

Skip the plan step — you are not implementing someone else's code.

**User gate 2 (reviewer):** _"Post these on the PR? (`post` / `edit` / `cancel`)"_

- `post` → post anchored review.
- `edit` → ask which to drop or refine, then re-prompt.
- `cancel` → stop.

## Posting an anchored PR review (both modes)

Post via the GitHub Reviews API as a **single** review with all selected actionable items as inline review comments anchored to specific diff lines. **Never** loose issue comments.

```bash
# /tmp/simple-review-payload.json contains: {event, commit_id, body, comments: [...]}

gh api -X POST "repos/<owner>/<repo>/pulls/<N>/reviews" --input /tmp/simple-review-payload.json
```

Payload shape:

```json
{
  "event": "COMMENT",
  "commit_id": "<head_sha>",
  "body": "<summary>",
  "comments": [
    { "path": "src/foo.ts", "line": 42, "side": "RIGHT", "body": "..." },
    {
      "path": "src/bar.ts",
      "start_line": 10,
      "line": 14,
      "start_side": "RIGHT",
      "side": "RIGHT",
      "body": "..."
    }
  ]
}
```

Rules:

- `event` is **always `COMMENT`** — never `APPROVE` or `REQUEST_CHANGES`. Approval is a human decision.
- Multi-line ranges: `start_line`, `line`, `start_side: "RIGHT"`, `side: "RIGHT"`.
- No clean anchor → pick the first changed line of the most relevant file; if literally nothing anchorable, fold into the review `body` as a labeled "general note" and flag in the post-confirmation summary.
- `commit_id` from `pr.headRefOid`.
- Build JSON with literal newlines (use `jq -n --arg body "$BODY" '...'` or a small `python -c`/heredoc), not `\n` escapes.

### Review body (top-level)

Three blocks, in order:

**1. Attribution line.** Exactly:

> _These comments were generated by @\<viewer-login\> using Claude Code._

Italicized. Substitute `<viewer-login>` from `gh api user --jq .login`. Non-negotiable — collaborators must be able to tell at a glance the review is AI-assisted. Do **not** mention the Simple Review skill by name; it's a local skill the PR author can't see or use.

**2. Summary.** Same paragraph from the in-chat synthesis: what the change does and your recommendation. Do not include mode, lenses applied, or convention sources consulted — that's noise.

**3. "Apply all comments at once" prompt.** A fenced block with a self-contained Claude Code prompt the PR author can paste into a Claude Code session on a checkout of this branch:

````
**Apply all comments at once** — paste this into Claude Code on a checkout of this branch:

```
Fetch the most recent review by @<viewer-login> on PR <PR_URL>. For every inline comment in that review, address the issue: when the comment includes a `suggestion` block, apply it verbatim; otherwise implement an equivalent fix that satisfies the comment's "Why it matters" rationale. After resolving each thread, post a reply on that thread with a one-line summary of what you changed. When all comments are handled, run the project's tests, commit the changes with a message that references the review, and report back any threads you could not resolve and why.
```
````

### Each comment body

````
**[SEVERITY] Title**

<Point — one or two sentences. References to other code use GitHub permalinks pinned to head_sha, not bare `file:lines`. The line(s) the comment is anchored to do not need to be relinked.>

**Why it matters:** <failure_mode>

**Example / context (when it clarifies the issue):**
```ts
// e.g. the established pattern being violated, the buggy snippet annotated,
// or the existing usage to compare against (permalink in the prose above).
```

**Suggested fix:**

```suggestion
<suggested_fix.after — replaces the anchored line(s); GitHub renders the diff vs. the anchored line(s) AND an "Apply suggestion" button>
```
````

Rules:

- **Include a code snippet whenever it makes the bug or fix clearer than prose alone.** Skip the snippet when the issue is purely structural or when the `suggestion` block alone says everything.
- **`suggestion` block stands alone on the PR.** GitHub already renders the diff vs. anchored line(s). Do **NOT** include a `// Before` fenced block in PR comments — it duplicates what GitHub shows. This is different from the in-chat **Actionable** section, which DOES render `// Before` + `// After` pairs so the user can review before approving the post.
- **When to skip the `suggestion` block:** structural fix with no drop-in (use prose + a target-shape fenced block), OR `suggested_fix.after` is empty (pure deletion — write "_Delete the anchored line(s)._" instead), OR `suggested_fix.before` is empty (pure addition — `suggestion` block still works; prefix `after` with `// Add after line <N>`).
- **Permalinks for in-prose line references.** Build as `https://github.com/<owner>/<repo>/blob/<head_sha>/<path>#L<start>-L<end>` (single line: `#L<n>`). Always pin to `head_sha`. Use Markdown link syntax with a meaningful label.

After posting, print the review `html_url` and a one-line summary of how many comments were posted (and fallback general-notes count if any).

## Rules

- **No subagents.** This skill runs entirely in the main context. If a finding needs deeper independent investigation that you can't do confidently in-line, surface it as a flagged finding rather than guess.
- Issue parallel `gh`/`git` commands in a single message when independent (PR view, diff, files, viewer).
- If a finding has empty `failure_mode` → drop. NIT not meeting the gate → drop. Do-not-raise items → drop. Caps applied (6 actionable, 8 nits).
- Hide nits by default. Print only on `show nits`.
- Reviews are always `event: COMMENT`. Never approve or request changes on the user's behalf.
- Conditional lenses (Security/Database/Frontend) run only when classification matches.
- Freshness preflight is mandatory before reading code. Read repo context via `git show "<context_ref>:<path>"`, not the worktree filesystem, unless `context_ref = worktree (stale, user accepted risk)`.
- Never run state-modifying git commands on the user's behalf (`checkout`, `stash`, `reset`, `clean`, `pull` with merge). Warn and ask. `git fetch` is allowed.
- Cross-repo evidence is opt-in by the user. Tag findings `evidence_required`, cap at MAJOR, ask before treating as load-bearing. `skip` → MINOR with "speculative" prefix.
- `suggested_fix` is always a `{ before, after }` object of code (not prose). **In-chat Actionable:** render both halves as separate `// Before` then `// After` fenced blocks. **PR-review inline comments:** render only the `suggestion` block (GitHub already renders the diff). Empty `before` = pure addition; empty `after` = pure deletion (omit `suggestion`, write "_Delete the anchored line(s)._"); omit entirely for structural changes.
- Both user gates are mandatory. Do not auto-apply recommendations and do not auto-post reviews.
