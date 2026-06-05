---
name: simple-review
description: Single-pass code review of the current branch or a PR using the in-depth review rubric without subagents, posted as anchored PR comments. Use when the user asks to review a small or medium diff, wants a fast or low-budget review, or runs /simple-review [PR-number-or-URL]. For large or high-stakes diffs that benefit from multiple debating reviewers, use in-depth-review instead.
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

You hold review state in-context — no `/tmp/*` persistence needed for findings (the PR-posting step writes one transient payload file; see Posting an anchored PR review).

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

A finding's evidence is "cross-repo" when its load-bearing claim depends on code in any repo other than the one containing the diff — most commonly a consumer, producer, or downstream parser of something the diff changes. **Never silently read external repos and never claim a downstream impact you have not verified** — speculating that "the FE will break" without reading the consumer is a top source of false-positive findings. Cap any cross-repo finding at **MAJOR** until verified.

Read [references/cross-repo-evidence.md](references/cross-repo-evidence.md) before raising or finalizing any cross-repo finding — it has when the policy fires, the verify-or-downgrade procedure, the access-request template, and what "verify" means for contract/schema vs API-response changes.

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
- Contract/backward-compat for any consumer-visible response shape change. **If you suspect a consumer break, the finding is cross-repo — follow the Cross-repo evidence policy before raising it. Do not raise speculative "the FE will fail to parse" findings without reading the FE.**

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

Tag every convention finding with `[CONVENTION]` in the title. Cap severity at MAJOR (only when behavior diverges as a result) or MINOR otherwise.

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
3. **Cross-repo audit.** For every finding, ask: does the failure_mode reference a downstream actor (FE, mobile, consumer service, rolling deploy, external library user) or a contract/schema/public-artifact boundary? If yes, did you actually read the relevant external file(s) to confirm the claim, or are you reasoning from priors about "how FEs usually work"? If you didn't read it, the finding is cross-repo — route to the Cross-repo evidence policy (verify, ask for access, or downgrade to a clearly-labeled "speculative" MINOR). Do not ship a "consumer will break" finding sourced from imagination.
4. **Drop do-not-raise items** that slipped through.
5. **Apply the NIT gate.** NITs that don't meet (a)/(b)/(c) → drop. Kept internally but hidden by default in synthesis.
6. **Merge near-duplicates** under one finding (note which lens(es) surfaced it).
7. **Apply hard caps.** 6 actionable, 8 NITs retained, rest summarized as "N additional items omitted".

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

````markdown
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

Do **not** print by default. Print only: _"N nit(s) available (M from convention audit). Pick `Show the N NIT(s) first` in the picker below to see them."_ If N is 0, omit this entire section. Surface the "show nits" affordance as an option in the User gate 1 `AskUserQuestion` call (not as typed text). When selected, print one-liners with `file:lines` and `[CONVENTION]` tag where applicable, then re-call User gate 1.

### Withdrawn

Terse one-liners of items you dropped (do-not-raise, NIT gate, self-slop audit). Transparency only.

## User gate 1 — select items

Ask via **`AskUserQuestion`**, not as a text prompt. Render each actionable finding as an option, with a trailing "show the N NIT(s) first" option when `N > 0`. Set `multiSelect: true` so the user can pick any combination (including none). Do not proceed until the user answers.

**Template:**

```ts
AskUserQuestion({
  questions: [
    {
      question: "Which findings should I <verb>?", // "post as inline comments on PR <N>" / "implement locally" / "act on"
      header: "Findings",
      multiSelect: true,
      options: [
        { label: "1 - <short title> (<SEVERITY>)", description: "<one-sentence failure_mode>" },
        { label: "2 - …", description: "…" },
        // …one entry per actionable finding (cap 6)
        { label: "Show the <N> NIT(s) first", description: "Print the NIT list before deciding." }, // omit when N == 0
      ],
    },
  ],
});
```

Option-label format: `<id> - <short title> (<SEVERITY>)`. The id matches the in-chat numbering in the Actionable section above. The `description` is one short sentence — the failure_mode, not the fix. Do not pad with file paths; the user already has the full Actionable section in the chat.

Branching on the answer:

- **Zero findings selected** (user submitted no boxes / picked Skip) → end the skill with a one-line "no findings selected — nothing to do" reply.
- **Only "Show the N NIT(s) first"** selected → print the NITs (one-liners with `file:lines` and `[CONVENTION]` tag where applicable), then re-call `AskUserQuestion` for this same gate.
- **Findings selected (with or without the NIT toggle)** → proceed to gate 2. If the NIT toggle was also checked, print NITs once before gate 2.

## Branch on mode

### Author mode

**Plan.** For the selected ids only, produce an ordered implementation plan: steps, files touched per step, tests to add/update, verification commands. Do **not** edit files yet.

**User gate 2 (author)** — ask via **`AskUserQuestion`** (`multiSelect: false`):

```ts
AskUserQuestion({
  questions: [
    {
      question: "What do you want to do with the selected findings?",
      header: "Next step",
      multiSelect: false,
      options: [
        { label: "Implement locally", description: "Apply the plan against your checkout." },
        {
          label: "Post as review",
          description: "Post anchored comments on your own PR for the team to see, then stop.",
        },
        { label: "Both", description: "Post the review first, then execute the plan locally." },
        { label: "Edit the plan", description: "Revise the plan; I'll re-prompt this gate." },
        { label: "Cancel", description: "Stop." },
      ],
    },
  ],
});
```

- `Implement locally` → execute the plan.
- `Post as review` → post anchored review (below); skill ends.
- `Both` → post review first, then execute.
- `Edit the plan` → revise, re-prompt this gate.
- `Cancel` → stop.

**Execute.** Use TodoWrite to track each step. Apply the plan, run verification, report results. If a step surfaces a new substantive issue not in the selected items, stop and ask before expanding scope.

### Reviewer mode

Skip the plan step — you are not implementing someone else's code.

**User gate 2 (reviewer)** — ask via **`AskUserQuestion`** (`multiSelect: false`):

```ts
AskUserQuestion({
  questions: [
    {
      question: "Post these on the PR?",
      header: "Post review",
      multiSelect: false,
      options: [
        {
          label: "Post",
          description: "Submit a single COMMENT review with the selected anchored comments.",
        },
        { label: "Edit", description: "Ask which to drop or refine, then re-prompt." },
        { label: "Cancel", description: "Stop." },
      ],
    },
  ],
});
```

- `Post` → post anchored review.
- `Edit` → ask which to drop or refine, then re-prompt.
- `Cancel` → stop.

## Posting an anchored PR review (both modes)

When the user approves items to post, submit a **single** review via the GitHub Reviews API (`event: COMMENT` — never `APPROVE`/`REQUEST_CHANGES`), with every selected actionable item as an inline comment anchored to its diff line. Never use loose issue comments.

Follow [references/posting-pr-review.md](references/posting-pr-review.md) exactly — it has the `gh api` call, the payload shape, the three-block review body (attribution line, summary, apply-all prompt), and the per-comment body budget and format. After posting, print the review `html_url` and a one-line summary of how many comments were posted (and fallback general-notes count if any).

## Rules

- **No subagents.** This skill runs entirely in the main context. If a finding needs deeper independent investigation that you can't do confidently in-line, surface it as a flagged finding rather than guess.
- Issue parallel `gh`/`git` commands in a single message when independent (PR view, diff, files, viewer).
- If a finding has empty `failure_mode` → drop. NIT not meeting the gate → drop. Do-not-raise items → drop. Caps applied (6 actionable, 8 nits).
- Hide nits by default. Print only when the user selects `Show the N NIT(s) first` in the User gate 1 picker.
- Reviews are always `event: COMMENT`. Never approve or request changes on the user's behalf.
- Conditional lenses (Security/Database/Frontend) run only when classification matches.
- Freshness preflight is mandatory before reading code. Read repo context via `git show "<context_ref>:<path>"`, not the worktree filesystem, unless `context_ref = worktree (stale, user accepted risk)`.
- Never run state-modifying git commands on the user's behalf (`checkout`, `stash`, `reset`, `clean`, `pull` with merge). Warn and ask. `git fetch` is allowed.
- Cross-repo evidence is opt-in by the user. The policy fires whenever the diff touches a contract/schema/published-artifact boundary OR the finding's failure_mode references a downstream actor (FE, mobile, consumer service, rolling deploy). Identify the specific external file you'd need to read, search locally first, then ask the user using the access-request template. Cap at MAJOR until verified; `skip` → either drop or keep as MINOR with a visible "speculative — assumes `<X>`" prefix. **Never raise a "consumer will break" finding without reading the consumer.**
- `suggested_fix` is always a `{ before, after }` object of code (not prose). **In-chat Actionable:** render both halves as separate `// Before` then `// After` fenced blocks. **PR-review inline comments:** render only the `suggestion` block (GitHub already renders the diff). Empty `before` = pure addition; empty `after` = pure deletion (omit `suggestion`, write "_Delete the anchored line(s)._"); omit entirely for structural changes.
- Both user gates are mandatory and **must** be presented via `AskUserQuestion` (the structured picker), not as inline text questions. Do not auto-apply recommendations and do not auto-post reviews.
