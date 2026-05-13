---
name: in-depth-review
description: Run a multi-agent code review on the current branch or a PR, with engineering, minimalist, conventions, and conditional specialist reviewers.
---

# In-Depth Review

Run a multi-agent code review on the current branch *or* on a PR identified by argument. By default dispatches three parallel reviewers (engineering+customer, minimalist, conventions) and conditionally adds up to three domain specialists (security, database, frontend) when the diff touches their surface. The first-principles adversarial agent (Agent A) is **opt-in** — include it only when the user explicitly asks (see Invocation). Agents review in parallel, debate once, and the main agent moderator-filters and synthesizes a report. Author vs reviewer mode adapts the post-review flow.

## Invocation

- **`/in-depth-review`** — review the current branch (resolves the open PR for the branch if any, otherwise diffs against the default branch).
- **`/in-depth-review <PR-number-or-URL>`** — fast path for reviewing someone else's PR while sitting on `main` (typical entry from Claude Desktop in code mode on a worktree). Skips the local branch checkout, fetches diff and metadata via `gh`, forces **reviewer mode**, and skips the plan/execute path. Accepts either a bare number (resolved against the current repo) or a full GitHub PR URL (which also identifies the owner/repo, useful when the worktree's remote differs).

### Agent roster

| Letter | Name           | Role                                  | Default state                                |
| ------ | -------------- | ------------------------------------- | -------------------------------------------- |
| A      | Adversarial    | First-principles adversarial          | Opt-in only (`with adversarial`, `+A`, etc.) |
| B      | Engineering    | High engineering standards + customer | Always on                                    |
| C      | Minimalist     | Smallest-diff posture                 | Always on                                    |
| D      | Conventions    | Repo-rules / docs                     | Always on                                    |
| E      | Security       | Security & API surface                | Conditional (auth/route/contract files)      |
| F      | Database       | DB schema, queries, migrations        | Conditional (migration/schema/model files)   |
| G      | Frontend       | FE conventions & UX correctness       | Conditional (FE files)                       |

**Refer to agents by name in everything the user sees** (Summary, Actionable items, Raised-by lines, Disagreements, Withdrawn). The letter is a compact prefix for finding IDs (`B1`, `C3`, `Adversarial`/`A1`, …) and a shorthand inside this document — never the only label in user-facing prose. The Round 2 `original_author` field stores the **name**, not the letter.

### Agent A (first-principles adversarial) is opt-in

The Adversarial agent (A) is skipped by default. Include it only when the user's invocation contains a clear opt-in phrase such as `with adversarial`, `with agent a`, `include adversarial`, `add the adversarial agent`, `+A`, or equivalent. If the user gives a more ambiguous instruction (e.g. "run the full review"), ask once whether to include the Adversarial agent before dispatching. Record the decision (`agent_a_enabled: true|false` + the phrase that triggered the opt-in, if any) in `/tmp/in-depth-review-meta.json` and surface it in the Summary so the user can see what ran.

## Scope

Two entry paths:

### Path A — PR-argument fast path (when an argument is provided)

- Parse the argument: bare integer → use current repo (`gh repo view --json nameWithOwner --jq .nameWithOwner`); URL → extract `<owner>/<repo>` and `<N>` from the URL.
- Do **not** check out the PR branch. Operate from whatever the working directory is (typically `main` in a worktree). Convention/file reads happen against a verified-fresh ref — see **Freshness preflight** below.
- Mode is **locked to reviewer**. Skip mode detection.

Gather in parallel:

```bash
gh pr view <N> --repo <owner>/<repo> --json number,url,title,body,baseRefName,author,headRefOid,headRepository,files
gh pr diff <N> --repo <owner>/<repo>
gh api user --jq .login
```

Persist:

- Diff stdout from `gh pr diff` → `/tmp/in-depth-review-diff.patch`.
- `pr.title + pr.body` → `/tmp/in-depth-review-context.md`.
- `pr.files[].path` → `/tmp/in-depth-review-files.txt`.
- Meta (PR number/url/baseRefName/author, viewer login, head SHA, owner/repo, mode=`reviewer`, conditional-agent set after classification) → `/tmp/in-depth-review-meta.json`.

If `pr.author.login == viewer.login`, still proceed in reviewer mode (the user explicitly asked for the PR-arg path; honor it) but flag this in the synthesis Summary so the user can switch to a manual `/in-depth-review` run on their checkout if they meant to implement.

### Path B — current-branch path (no argument)

- If there is an open PR for the current branch, review that PR. Base = `baseRefName`, diff = `git diff $base...HEAD`. Capture PR title + body as context.
- Otherwise, review the current branch vs the default branch (`main`, fall back to `master`). Capture `git log --format='%h %s%n%n%b' $base..HEAD` as context.
- **Never** review uncommitted working-tree changes. If the branch has no diff vs base, stop and report.

Gather in parallel:

```bash
git rev-parse --abbrev-ref HEAD
git symbolic-ref refs/remotes/origin/HEAD 2>/dev/null | sed 's|refs/remotes/origin/||'
gh pr list --head "$(git branch --show-current)" --state open --json number,url,title,body,baseRefName,author,headRefOid
gh api user --jq .login
gh repo view --json nameWithOwner --jq .nameWithOwner
git diff --name-only "$base"...HEAD
```

Determine **mode**:

- PR exists and `pr.author.login == viewer.login` → **author mode**.
- PR exists and authors differ → **reviewer mode**.
- No PR exists → **author mode** (reviewing your own pre-PR branch).

Persist context so subagents read it from disk:

- Diff → `/tmp/in-depth-review-diff.patch`
- Context (PR body or commit log) → `/tmp/in-depth-review-context.md`
- Changed-file list → `/tmp/in-depth-review-files.txt`
- Mode + repo metadata (PR number, url, base, head SHA, author, viewer, owner/repo, list of conditional agents that will run, verified-fresh `context_ref` from the freshness preflight) → `/tmp/in-depth-review-meta.json`

## Freshness preflight (runs before Diff classification — both paths)

Stale local state is the #1 cause of false-positive findings: it produces "evidence" of bugs that were already fixed on `main`. Before dispatching any agent, the main agent **must** verify that the ref it tells subagents to read for context is current with the remote, and pass that ref into subagent prompts so agents read code via `git show <ref>:<path>` and `git grep ... <ref> -- <paths>` rather than the worktree filesystem.

Run this preflight on the **primary repo** (the one containing the diff under review):

```bash
git fetch origin "$base" --quiet 2>&1 | tail -3
git rev-parse --abbrev-ref HEAD
git status --porcelain
git rev-list --left-right --count "HEAD...origin/${base}"   # prints "<ahead>\t<behind>"
git log -1 --format='%h %ci' "origin/${base}"
```

Decide `context_ref` (the ref subagents must read for repo context, distinct from the diff itself):

- **Path A (reviewer mode, PR-arg):** ideal `context_ref = origin/${base}` (whatever the PR's base branch is, usually `main`). The worktree filesystem must **only** be used as `context_ref` when `HEAD == origin/${base}` AND working tree is clean AND `git fetch` succeeded.
- **Path B (author mode, current-branch):** `context_ref = origin/${base}`. The user's local feature-branch files are the *diff*, not the *pre-PR context*; pre-PR convention/neighbor reads must come from `origin/${base}`.

If any of the following are true, **stop and ask the user before continuing**:

1. `git fetch origin "$base"` failed (offline, auth, repo permissions). Print the error.
2. `HEAD` differs from `origin/${base}` (Path A only — Path B expects HEAD on a feature branch).
3. Working tree is dirty (`git status --porcelain` is non-empty) **and** the dirty paths overlap the diff's changed-file list or any path subagents will need to read.
4. `HEAD` is behind `origin/${base}` (any non-zero "behind" count).
5. `HEAD` is more than a small number of commits ahead of `origin/${base}` on Path A (ahead implies the user is mid-work on a branch that isn't the PR; their worktree is not a clean main).

Warn template (substitute the verified state):

> Freshness check for `<owner>/<repo>` at `<worktree-path>`:
> - on branch `<HEAD-branch>` (expected `<base>` for Path A)
> - `<N>` commit(s) ahead, `<M>` commit(s) behind `origin/<base>` (last remote commit: `<short-sha> <iso-date>`)
> - working tree: `<clean | dirty: N file(s)>`
> Reading code from this worktree may surface findings based on stale or local-only state.
> Reply: `proceed` (use worktree anyway and accept the risk), `use-origin` (read context via `git show origin/<base>:<path>` instead — recommended, no checkout needed), or `stop` (let me clean up and re-run).

**Never** run `git checkout`, `git stash`, `git reset`, or any other state-modifying git command on the user's behalf. The skill warns and asks; the user is the only actor that resolves local state.

Record the resolved `context_ref` (e.g. `origin/main`, or the literal string `worktree (stale, user accepted risk)`) in `/tmp/in-depth-review-meta.json`. Every subagent prompt must explicitly state which ref to read and how (see "Reading code in subagents" below).

### Reading code in subagents

When `context_ref` is `origin/<base>`:

- Read repo context via `git show "${context_ref}:<path>"` (for whole files) and `git grep -n <pattern> "${context_ref}" -- <paths>` (for searches).
- The Read tool reads the working tree, which may be stale; subagents must **prefer** `git show` for context reads. The working tree may only be read when the file isn't tracked at `context_ref` (e.g. brand-new file in the PR diff) and that fact is explicitly noted in the finding.

When `context_ref` is `worktree (stale, user accepted risk)`:

- Subagents may use Read on the worktree, but every finding must include a one-line "verified against: worktree-stale" caveat in the `point`, and the moderator filter must downgrade CRITICAL/MAJOR to MINOR unless the evidence is internal to the diff itself.

## Cross-repo evidence policy (binding for all agents)

A finding's evidence is "cross-repo" when it depends on code in any repo other than the one containing the diff. Examples: the diff is in `clipboard-health` but the finding claims that `cbh-admin-frontend`, `payment-service`, or `worker-service-backend` still calls a deprecated endpoint.

**Subagents must NOT silently read external repos.** Doing so risks (a) reading a stale local checkout and fabricating evidence (see "Freshness preflight"), or (b) citing a path the user has no checkout of, which the moderator can't verify.

Subagent rule: if a finding's load-bearing evidence is in another repo, the subagent must emit the finding with the additional field:

```json
"evidence_required": {
  "repos": ["cbh-admin-frontend", "payment-service"],
  "what_to_verify": "concrete grep / file path / question the moderator should answer to confirm or kill the finding"
}
```

…and cap the finding's severity at **MAJOR**. Findings marked `evidence_required` cannot be CRITICAL until the moderator has confirmed the cross-repo evidence on a verified-fresh ref.

Moderator rule: after Round 1, collect every `evidence_required` block across all subagents and ask the user **before Round 2**:

> Some findings depend on code outside `<primary-repo>`. To verify, I need access to:
> - `<repo-1>` — to check `<what_to_verify>` (raised by agent <X>)
> - `<repo-2>` — to check `<what_to_verify>` (raised by agent <Y>)
> For each repo, reply with one of:
> - a local path (e.g. `/Users/you/repos/cbh/<repo>`) — I will run the freshness preflight on it before reading
> - `gh:<owner>/<repo>` — I will fetch the file content via `gh api repos/<owner>/<repo>/contents/<path>?ref=main` instead of cloning
> - `skip` — the finding will be downgraded to "speculative — cross-repo evidence not verified" and capped at MINOR
> Or reply `skip all` to downgrade every cross-repo finding.

For each user-provided local path, run the **same freshness preflight** as on the primary repo (fetch, check ahead/behind, check working-tree cleanliness). If the external repo is stale or on a non-default branch, warn with the same template and require explicit user acknowledgement before reading. Always read external code via `git show "${external_context_ref}:<path>"` / `git grep ... "${external_context_ref}" -- <paths>`, never via the worktree filesystem.

After verification, re-dispatch only the affected subagents (one agent per repo group) with the verified evidence (or its absence) inlined, so they can finalize severity for Round 2. Findings whose cross-repo evidence the user `skip`s are kept but capped at MINOR with a "speculative" prefix in the title.

## Diff classification (runs before Round 1)

Match the changed-file list against these path patterns. A conditional agent runs only when its pattern matches at least one changed file:

- **E — Security** triggers on: any file under `routes/`, `controllers/`, `middleware*/`, files matching `auth*`, `*permission*`, `*acl*`, `*token*`, `*session*`, response serializers, OpenAPI / contract definitions, or new API endpoint files.
- **F — Database & migrations** triggers on: `migrations/`, `*.sql`, files matching `schema*`, Mongoose/Prisma model files (`models/`, `*.model.ts`, `*.schema.ts`), repository / DAL files, or files containing query builders.
- **G — Frontend** triggers on: `*.tsx`, `*.jsx`, `*.css`, `*.scss`, files under `pages/`, `components/`, `hooks/`, or anything importing from `react`, `@tanstack/react-query`, or a design-system package.

Record the dispatched set in `/tmp/in-depth-review-meta.json` so Round 2 knows the full agent list.

## Severity rubric (binding for all agents)

- **CRITICAL** — realistic input causes incorrect behavior, data loss, security regression, broken contract, or a paging incident.
- **MAJOR** — meaningful degradation of correctness/UX/observability under realistic conditions; OR a documented-convention violation with concrete downstream impact.
- **MINOR** — cheap, concrete improvement with a named benefit.
- **NIT** — only admissible if (a) repeats ≥2× in the diff, (b) conflicts with a documented convention, or (c) is a one-line trivial fix. Otherwise drop silently.

Every finding **must** include a `failure_mode` field: one sentence on the concrete user-, on-call-, or maintainer-visible bad outcome that would occur if not fixed. Hypotheticals like "a future caller might…" do not satisfy this; such findings will be dropped during moderation.

### Do-not-raise list (binding)

Do not surface any of:

- Speculative defensiveness at trusted internal boundaries (e.g. "what if this private helper got null?").
- Restating the obvious ("consider a comment explaining what this does").
- Hypothetical future-caller scenarios with no current caller.
- Style/formatting a linter or formatter already covers.
- Test-coverage demands on trivially-verifiable code (one-line forwarding helpers, simple getters).
- "Add observability" without naming a concrete failure mode it would help debug.
- Abstract SOLID-style "consider extracting…" suggestions without a concrete failure mode.
- Aesthetic naming preferences. Only raise names that mislead about behavior.

## Rounds (hard cap: 2)

### Round 1 — parallel independent reviews

Dispatch all selected agents **in the same message** via the `Agent` tool with `subagent_type: general-purpose`. The default selected set is **Engineering, Minimalist, Conventions** (B/C/D), plus **Security, Database, Frontend** (E/F/G) when triggered by classification. **The Adversarial agent (A) is dispatched only when `agent_a_enabled` is true** (see Invocation — "Agent A is opt-in"). Each agent gets the file paths above, their role brief, and permission to Read repo files for context. Do **not** let agents see each other's output in this round. **Each agent emits at most 8 findings, prioritized — not exhaustive.**

**Every subagent prompt must include the following input contract verbatim** (substitute `<context_ref>` with the value resolved in the Freshness preflight):

> **Context-read contract.** The verified-fresh ref for repo context is `<context_ref>`. For any file you read that is part of the primary repo's tracked content (i.e. *not* a brand-new file in this PR's diff), use `git show "<context_ref>:<path>"` or `git grep -n <pattern> "<context_ref>" -- <paths>` rather than the Read tool on the worktree. If you read from the worktree because the file is new in the diff or untracked at `<context_ref>`, say so in the finding's `point`.
>
> **Cross-repo evidence contract.** If a finding's load-bearing evidence is in any repo other than this one, do NOT silently read another local checkout — those checkouts may be stale or on unrelated branches. Instead, emit the finding with an `evidence_required` field naming the repo(s) and the specific verification question, and cap your severity at MAJOR. The moderator will ask the user for verified access before Round 2 and re-dispatch you if needed.

Required output per finding: `id` (`A1`, `B3`, `C2`, `D4`, `E1`, `F1`, `G1`, …), `severity`, `file:lines`, `title` (one sentence), `point` (one short paragraph), `failure_mode` (one sentence), optional `suggested_fix` (see schema below), and optional `evidence_required` (object with `repos: string[]` and `what_to_verify: string` — required whenever the finding depends on cross-repo state).

**`suggested_fix` schema** (when present): an object with two string fields, both code (not prose), preserving the file's actual indentation:

```json
"suggested_fix": {
  "before": "<the exact current code being changed, copied verbatim from file:lines>",
  "after":  "<the replacement code that would land at the same anchor>"
}
```

- For a **pure deletion**, set `after` to the empty string `""`.
- For a **pure addition** at a new line (nothing replaced), set `before` to the empty string `""` and prefix `after` with a one-line comment indicating where it lands (e.g. `// add after line 142`).
- For a **structural change** with no clean drop-in (e.g. "move this file"), omit `suggested_fix` entirely and put the guidance in `point` / `failure_mode`.
- Both fields must be code snippets directly usable to compute a diff. Do not include surrounding prose, do not paraphrase, and do not elide content with `// ...`. If the change is too large to inline both, omit `suggested_fix` and describe the fix in `point`.

#### Always-on agents (Engineering / Minimalist / Conventions) and the opt-in Adversarial agent

**Adversarial (A) — First-principles. Opt-in only.** Dispatch only when the user explicitly asks (see Invocation — "Agent A is opt-in"). Skip silently otherwise. Posture: *"What is the single most important thing this PR gets wrong? Then up to 7 more, ranked."* Question whether the change actually solves the underlying problem and whether the chosen approach is right. Challenge specific library / pattern / approach choices when they don't hold up on their own merits. Do **not** challenge foundational stack choices that are out of scope for the PR. Flag internal inconsistencies inside the diff itself. Specifically also probe:

- Should this PR be split, or is it bundling unrelated tickets?
- Is the root cause of the bug clear, and is it fixed in *every* place it manifests?
- Is a feature flag warranted but missing?
- Are there old feature flags or dead references this change makes deletable?

Conventions are the Conventions agent's (D) job — do not double up.

**Engineering (B) — High engineering standards + customer-centric.** Posture: *"For each change, name a realistic input or condition that would expose a bug. If you cannot, do not raise it."* Evaluate edge cases, error paths, observability, tests (coverage of real risk, not lines), high-level security (E does the deep dive when dispatched), concurrency, performance at real scale, data integrity, accessibility, UX, degraded-mode behavior, backward compatibility, on-call implications, and domain assumptions in the diff. Specifically also probe:

- Async/await correctness — ordering matches the actual dependency between calls.
- Timezone correctness in date-handling code; currency variables explicitly in minor units.
- When API surface changed: AuthN, AuthZ, sensitive-data leakage, PII handling. Hand the deep dive to Security (E) if dispatched.
- When a migration is in the diff: rollback strategy, backward compatibility during rolling deploy, ETL / downstream impact. Hand to Database (F) if dispatched.
- When DB schema or queries changed: indexes for new query patterns, N+1 risk, cascade-delete semantics, data-type fit. Hand to Database (F) if dispatched.
- Telemetry covers *business / product* value, not only engineering surface metrics (latency / error rate).
- Contract / backward-compatibility for any consumer-visible response shape change.

Skip items that fail the realistic-input test.

**Minimalist (C).** Posture: the smallest diff that ships the intent is the best diff. Identify unneeded abstractions, speculative generality, dead branches, redundant validation, defensive code at trusted internal boundaries, comments that restate code, new files / utilities that duplicate existing ones, tests that test the framework rather than behavior, flags / config knobs without a concrete caller. Specifically also probe:

- Duplicated error handlers in the same scope.
- Commented-out code or dead branches (still gated by `failure_mode`).

For every "delete this" finding, `failure_mode` must state the *concrete cost of keeping the code*.

**Conventions (D) — Repo-rules.** Sole owner of convention checks (backend / shared). Read `AGENTS.md`, `CLAUDE.md`, `.rules/`, Cursor rules, `docs/adr/` (or equivalent), package READMEs in the diff's path, and one or two neighboring files in the same service for in-practice patterns. Then check the diff for:

- Preferred internal packages over third-party ones (e.g. `@clipboard-health/*`, internal `lib/*`).
- Terminology rules (worker/workplace, not HCP/facility).
- `lodash` removal preference.
- `@clipboard-health/datetime` over ad hoc date-library choices.
- Internal `Money` package for currencies; explicit minor-units variable names.
- Logging conventions (`longContext`, `ObjectId.toString()`, no variables in log messages).
- Null/undefined checks via `isDefined` / `isNil` over truthy.
- 4+ argument functions → params object.
- Error-handling patterns in the same service (typed `ServiceResult` vs throw).
- Test conventions, naming, file location.
- Business-meaningful magic constants that should be named.
- ENV access via the project's Configuration abstraction, not direct `process.env`.
- Logging library standard for the repo (e.g. Winston) — derive from existing code, not hardcoded.
- Pinned dependencies; lock file (`package-lock.json` / `yarn.lock`) in sync with `package.json`.
- RESTful route shape and uniform response format within a service.
- Internal inconsistency *within the diff itself* (e.g. half of imports from one package family, half from upstream).

Frontend conventions are the Frontend agent's (G) territory when G is dispatched. If Frontend is not dispatched (no FE files), Conventions (D) may surface FE convention drift if it appears.

Tag every finding `[CONVENTION]`. Cap severity at MAJOR (only when behavior diverges as a result of the violation) or MINOR otherwise. At the top of your output, list the specific files/sources you checked.

#### Conditional agents

**Security (E) — API surface.** Dispatched when the diff touches auth / route / permission / serializer / contract files. Posture: *"Where could this change leak data, bypass authorization, or expand the trust boundary?"* Specifically check:

- AuthN: every new or modified endpoint has authenticated identity unless explicitly public.
- AuthZ: per-endpoint and per-resource permission checks; cross-tenant / cross-user access.
- Secrets in configuration — no hardcoded keys, no secrets in client bundles.
- No self-made or client-side cryptography.
- SQL / NoSQL injection vectors (string-concatenated queries, untrusted `$where`, raw aggregation pipelines from user input).
- Sensitive data in response payloads — over-fetching, over-serialization, internal IDs leaked.
- PII handling — PII fields logged, cached, or sent to telemetry.
- Input validation at the boundary (Zod / class-validator) on every new endpoint.

Cap output at 8 findings. `failure_mode` required.

**Database (F) — Schema, queries, migrations.** Dispatched when the diff touches migrations / SQL / schema / model / query files. Posture: *"What breaks at production scale or during deploy?"* Specifically check:

- Index coverage for new query patterns; missing compound indexes.
- N+1 query shapes; loops issuing per-iteration queries.
- Schema normalization — denormalization that creates write-amplification or update anomalies.
- Data types — range, precision, locale (numeric, date, money).
- Cascade-delete and FK-on-delete semantics; orphan risk.
- Migration rollback strategy; can the migration run online without downtime?
- Backward compatibility during a rolling deploy (old code reads new schema, new code reads old schema).
- ETL / downstream consumer impact when schema or field semantics change.
- New collections / tables ship with the indexes their query patterns need on day one.

Cap output at 8 findings. `failure_mode` required.

**Frontend (G) — Conventions & UX-correctness.** Dispatched when the diff touches `*.tsx` / `*.jsx` / FE component / hook / page paths. Posture: *"Does this follow our FE conventions, and will it behave correctly under realistic user conditions?"* Specifically check:

- API calls go through v2 / custom hooks, not raw `fetch` / `axios` in components.
- React Query: thin wrappers (`useGetQuery`, etc.), not raw `useQuery` / `useMutation`.
- Falsy-value checks use `isDefined()` / `isNil()`, not `!value`.
- Test actions wrapped in `act()`.
- Zod schemas: `z.nativeEnum` used where a TS enum already exists.
- Prop drilling — when a value is passed through ≥2 layers, is a context preferable?
- Feature flags via `useCbhFlag` (or repo equivalent), not direct config reads.
- New components / styles pulled from the design-system library, not built from scratch.
- Loading / empty / error states present for any new data-fetching surface.
- Accessibility: keyboard navigation, ARIA roles, labels on interactive controls.

Cap output at 8 findings. `failure_mode` required.

### Round 2 — debate

Dispatch the **same set of agents** that ran in Round 1, in parallel. Each agent receives **all Round 1 outputs** (passed inline) and must:

- Re-examine each of their own comments and **withdraw** any that don't survive scrutiny.
- For each comment from the other agents: mark `agree`, `disagree` (with reasoning), or `refine` (propose a tighter version).
- Flag items where disagreement is substantive and unlikely to resolve.

Output per item: `id`, `original_author` (agent **name**, e.g. `Engineering`, `Minimalist`, `Conventions`, `Security`, `Database`, `Frontend`, `Adversarial` — not the bare letter), `verdict` (keep | withdraw | agree | disagree | refine), `final_severity`, `final_title`, `final_failure_mode`, `reasoning`, `suggested_fix`, and rebuttals `[{from, stance, reasoning}]` where `from` is also the agent name.

**This is the last round.** Residual disagreement goes to the Disagreements section.

## Moderator filter (main agent — runs after Round 2, before synthesis)

Apply these filters in order. They are non-negotiable:

1. **Drop findings with empty or hypothetical `failure_mode`.** "A future caller might…", "in case someone…" → drop.
2. **Drop do-not-raise items** that slipped through.
3. **Apply the NIT gate**. NITs that don't meet (a)/(b)/(c) → drop. NITs that do meet are kept internally but hidden by default in synthesis.
4. **Merge near-duplicates** across agents into one item (preserve all attributions in `Raised by:`).
5. **Apply hard caps**: at most **6 actionable** items (CRITICAL/MAJOR/MINOR) and **8 NITs** retained internally. Anything beyond is summarized as "N additional items omitted; ask for the full list."

Filtered items go into Withdrawn (one-liner) so nothing is invisible.

## Synthesize (main agent)

### Summary

One short paragraph: what the change does, each agent's headline verdict in a clause (refer to agents by **name** — "Engineering says …", "Minimalist says …", "Conventions says …"), overall recommendation (ship / ship with changes / do not ship). State the **mode** ("Author mode" or "Reviewer mode — PR by @\<author\>"), whether **Adversarial ran or was skipped** (and why — "opted in via …" or "skipped — default; ask `with adversarial` to include"), and which conditional agents ran or were skipped (e.g. "Security ran; Database skipped — no migration/schema files; Frontend ran"). Letters are fine as parenthetical shorthand if it aids reading (e.g. "Engineering (B) says …"), but every agent reference must include the name.

### Actionable

Up to 6 items that survived scrutiny and the moderator filter. Format each:

- **[SEVERITY] Title** — `file:lines`
- **Point:** one sentence.
- **Why it matters:** the `failure_mode` sentence.
- **Counterpoint (if any):** one sentence on the rebuttal and why it didn't overturn.
- **Suggested fix (before → after):** two stacked fenced code blocks with language tags — first labeled `// Before` (the current code from `file:lines`), then `// After` (the replacement). Use the same language tag for both. Omit when the fix is structural (no clean drop-in) and explain in prose instead. For a pure deletion, show the `Before` block and write "*Delete these lines.*" under it. For a pure addition, show only the `After` block prefixed with `// Add after line <N>`.
- **Raised by:** comma-separated agent **names** (e.g. `Engineering, Conventions`); **agreed by:** comma-separated agent names. Do not use bare letters in this field — the user shouldn't have to decode A/B/C.

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

### Disagreements

Items where agents substantively disagreed and did not converge. One sentence per side (attribute each by agent **name**, e.g. "Engineering: …" / "Minimalist: …"), then the moderator's call with a one-line reason.

### Nits

Do **not** print the nits list by default. Print only one line: *"N nits available (M from convention audit). Reply `show nits` to see them."* If N is 0, omit the section entirely. When the user replies `show nits`, print the gated NITs as one-liners with `file:lines`, the raising agent's **name**, and `[CONVENTION]` tag where applicable, then re-prompt user gate 1.

### Withdrawn

Terse one-liners of Round 1 comments that were withdrawn or filtered. Each line ends with the raising agent's **name** in parentheses (e.g. "C7 — superseded by C4 (Minimalist)"). For transparency only.

## User gate 1 — select items

Ask exactly: *"Which items do you want to act on? Reply with ids (e.g. `B1, C2`), `all actionable`, `show nits`, or `none`."* Do not proceed until the user answers. `none` ends the skill cleanly. `show nits` prints the hidden list, then re-asks the same question.

## Branch on mode

### Author mode

**Plan.** For the selected ids only, produce an ordered implementation plan: steps, files touched per step, tests to add/update, verification commands. Do **not** edit any files yet.

**User gate 2 (author mode).** Ask: *"What do you want to do? (`implement-locally` / `post-as-review` / `both` / `edit-plan` / `cancel`)"*

- `implement-locally` → execute (see below).
- `post-as-review` → post anchored review (see below); skill ends.
- `both` → post the review first, then execute.
- `edit-plan` → revise from feedback, re-prompt.
- `cancel` → stop.

**Execute.** Use `TaskCreate` to track each step, apply the plan, run the verification, report results. If a step surfaces a new substantive issue not in the selected items, stop and ask before expanding scope.

### Reviewer mode

Skip the plan step entirely — you are not implementing someone else's code.

**User gate 2 (reviewer mode).** Ask: *"Post these on the PR? (`post` / `edit` / `cancel`)"*

- `post` → post anchored review (see below).
- `edit` → ask which items to drop or refine, then re-prompt.
- `cancel` → stop.

## Posting an anchored PR review (both modes)

Always post via the GitHub Reviews API as a **single** review, with all selected actionable items as inline review comments anchored to specific diff lines. **Never** loose issue comments.

Build the payload as JSON and pipe it through `gh api --input`:

```bash
# /tmp/in-depth-review-payload.json contains: {event, commit_id, body, comments: [...]}
gh api -X POST "repos/<owner>/<repo>/pulls/<N>/reviews" --input /tmp/in-depth-review-payload.json
```

Payload shape:

```json
{
  "event": "COMMENT",
  "commit_id": "<head_sha>",
  "body": "<summary>",
  "comments": [
    { "path": "src/foo.ts", "line": 42, "side": "RIGHT", "body": "..." },
    { "path": "src/bar.ts", "start_line": 10, "line": 14, "start_side": "RIGHT", "side": "RIGHT", "body": "..." }
  ]
}
```

Rules for posting:

- `event` is **always `COMMENT`** — never `APPROVE` or `REQUEST_CHANGES`. Approval / blocking is a human decision, not the skill's.
- For multi-line ranges, set `start_line`, `line`, `start_side: "RIGHT"`, `side: "RIGHT"`.
- For findings without a clean line anchor (rare), pick the first changed line of the most relevant file rather than dropping the comment or going loose.
- If there is no usable line anchor for a given finding, fold it into the review `body` as a labeled "general note" and flag this in the post-confirmation summary so the user knows.
- Use `commit_id` from `pr.headRefOid` so comments anchor to the reviewed commit.
- Resolve `<owner>/<repo>` once via `gh repo view --json nameWithOwner --jq .nameWithOwner` and stash it in `/tmp/in-depth-review-meta.json` alongside `head_sha` so permalinks below can be built without re-querying.

### Review body (top-level comment)

The `body` field on the review (not the inline comment bodies) must contain three blocks, in order:

**1. Attribution line.** A single sentence disclosing that the review was generated by an automated skill. Use exactly:

> *These comments were generated by @\<viewer-login\> using the In-Depth Review Claude Code skill.*

Substitute `<viewer-login>` from `gh api user --jq .login`. Italicize the line so it renders as muted text. This is non-negotiable — collaborators must be able to tell at a glance that the review is AI-assisted.

**2. Synthesis Summary.** The same one-paragraph summary printed in the in-chat synthesis: what the change does, headline verdicts per agent, overall recommendation (ship / ship with changes / do not ship), the mode, and which conditional agents ran.

**3. "Apply all comments at once" prompt.** A fenced block containing a self-contained Claude Code prompt the PR author (or any agent operator) can copy-paste into a Claude Code session on a checkout of this branch to address every inline comment in one shot. Template (substitute the `<…>` placeholders before posting):

````markdown
**Apply all comments at once** — paste this into Claude Code on a checkout of this branch:

```
Fetch the most recent review by @<viewer-login> on PR <PR_URL>. For every inline comment in that review, address the issue: when the comment includes a `suggestion` block, apply it verbatim; otherwise implement an equivalent fix that satisfies the comment's "Why it matters" rationale. After resolving each thread, post a reply on that thread with a one-line summary of what you changed. When all comments are handled, run the project's tests, commit the changes with a message that references the review, and report back any threads you could not resolve and why.
```
````

Build the body in `/tmp/in-depth-review-payload.json` with literal newlines (use `jq -n --arg body "$BODY" '{body: $body, ...}'` or build the JSON via a small heredoc-fed `python -c` so newlines are real `\n` in the JSON string, not the two characters `\` `n`).

Each comment body:

````markdown
**[SEVERITY] Title**

<Point — one or two sentences. Any reference to a specific file/line elsewhere in the codebase must be a GitHub permalink pinned to head_sha, not a bare `file:lines` string. The line(s) the comment is already anchored to do not need to be relinked.>

**Why it matters:** <failure_mode>

**Example / context (when it clarifies the issue):**
```ts
// e.g. the established pattern being violated, the two diverging imports
// inside the diff, the buggy snippet annotated, the existing usage to
// compare against (with a permalink in the prose above).
```

**Suggested fix:**

```suggestion
<suggested_fix.after — replaces the anchored line(s); GitHub renders the diff vs. the anchored line(s) AND an "Apply suggestion" button>
```
````

Rules for code and links inside the comment body:

- **Include a code snippet whenever it makes the bug or fix clearer than prose alone** — the established pattern being violated, the two diverging imports inside the diff, the corrected control-flow, or the comparison to existing usage. Skip the snippet only when the issue is purely structural or when the `suggestion` block alone says everything.
- **`suggestion` block stands alone on the PR.** GitHub already renders the diff vs. the anchored line(s) inside the suggestion block (red `-` lines + green `+` lines + one-click apply). Do **NOT** also include a `// Before` fenced block — it duplicates what GitHub already shows and makes the comment twice as long. This is different from the in-chat **Actionable** section, which DOES render `// Before` + `// After` pairs so the user can review the change before approving the post (the user has no GitHub renderer in their terminal).
- **When to skip the `suggestion` block:** the fix is structural with no clean drop-in (e.g. "move this file"), OR `suggested_fix.after` is empty (pure deletion — write "*Delete the anchored line(s).*" instead), OR `suggested_fix.before` is empty (pure addition — the `suggestion` block still works, but prefix `suggested_fix.after` with a `// Add after line <N>` comment so the intent reads cleanly).
- **For structural fixes with no `suggestion`**, you may use a regular language-tagged fenced block to show the target shape, and explain the move/rename in prose.
- **Example / context block (optional, separate from the fix).** When a code snippet clarifies the bug — the established pattern being violated, the two diverging imports inside the diff, an existing usage to compare against — render it as a regular language-tagged fenced block under a `**Example / context:**` heading, with a permalink in the prose above pointing to where it lives in the tree. This is NOT a duplicate of the anchored lines; if you're tempted to paste the anchored lines as "context," you're rebuilding the `// Before` block GitHub already renders — drop it.
- **Permalinks for in-prose line references.** Build them as `https://github.com/<owner>/<repo>/blob/<head_sha>/<path>#L<start>-L<end>` (single line: `#L<n>`). Always pin to `head_sha`, never `main` or a branch name — branch links break as soon as the branch moves. Use Markdown link syntax with a short, meaningful label (e.g. `[the existing ServiceResult pattern](https://github.com/...#L88-L104)`), not the raw URL.

After posting, print the review `html_url` and a one-line summary of how many comments were posted (and how many fell back to general notes, if any).

## Rules

- Use fresh `general-purpose` subagents for every round — do not reuse other subagent types.
- Issue all agent calls in a single message for each round so they run truly in parallel.
- Keep large content on disk (`/tmp/in-depth-review-*`) so round-2 prompts stay compact.
- If one agent fails or returns malformed output, re-dispatch **that agent only**; do not restart the round.
- If the diff is empty, stop with a one-line message — do not invent findings.
- Do not auto-apply recommendations and do not auto-post reviews. Both user gates are mandatory.
- The moderator filter is non-negotiable: empty `failure_mode` → drop, NIT not meeting the gate → drop, do-not-raise items → drop, caps applied.
- Hide nits by default. Only print them when the user replies `show nits`.
- Reviews are always `event: COMMENT`. Never approve or request changes on the user's behalf.
- Conditional agents (E/F/G) run only when classification matches. Do not invent triggers; if the user wants a forced full run, they will say so.
- The Adversarial agent (A) is opt-in. Default selected set is Engineering / Minimalist / Conventions (B/C/D), plus the classified subset of Security / Database / Frontend (E/F/G). Dispatch Adversarial only when the user explicitly asks (`with adversarial`, `with agent a`, `+A`, etc.). Surface the Adversarial on/off decision in the Summary so the user can see what ran.
- **Refer to agents by name in every user-facing surface** — Summary, Actionable items (`Raised by` / `agreed by`), Disagreements, Withdrawn, and `original_author` / `rebuttals[].from` in Round 2 output. Bare letters (A/B/C/D/E/F/G) are acceptable only as ID prefixes (`B1`, `C3`) and as parenthetical shorthand next to the name. The agent-name table in the "Agent roster" section is the authoritative mapping; do not invent alternative names.
- Freshness preflight is mandatory before any agent dispatch. Subagents read repo context via `git show "<context_ref>:<path>"` / `git grep ... "<context_ref>"`, not the worktree filesystem, unless the resolved `context_ref` is `worktree (stale, user accepted risk)`.
- Never run state-modifying git commands on the user's behalf (`checkout`, `stash`, `reset`, `clean`, `pull` with merge). The skill warns and asks; the user resolves local state. `git fetch` is allowed because it does not modify the working tree.
- Cross-repo evidence is opt-in by the user. Subagents tag findings with `evidence_required` and cap them at MAJOR until verified; the moderator asks the user for paths or `gh:owner/repo` slugs and runs the freshness preflight on each before treating the evidence as load-bearing. `skip` downgrades the finding to MINOR with a "speculative" prefix.
- `suggested_fix` is always a `{ before, after }` object of language-matched code snippets (never prose). **In-chat synthesis Actionable section:** render both halves as separate language-tagged fenced blocks (`// Before` then `// After`) — the user has no GitHub renderer in their terminal, so they need the pair to review the change before approving the post. **PR-review inline comments:** render ONLY the `suggestion` block — GitHub already renders the diff vs. the anchored line(s), so a separate `// Before` block would duplicate what's on screen. Empty `before` means pure addition (still emit a `suggestion` block; prefix `after` with `// Add after line <N>`). Empty `after` means pure deletion (omit the `suggestion` block and write "*Delete the anchored line(s).*"). Omit `suggested_fix` entirely for structural changes with no clean drop-in.
