# Review rubric (binding for both engines)

Low effort: the main agent reads this whole file and walks every active lens. High effort: each reviewer agent reads **Admission** plus its own lens section. Referenced from `SKILL.md`.

## Admission

### Severity ladder

- **CRITICAL** — realistic input causes incorrect behavior, data loss, security regression, broken contract, or a paging incident.
- **MAJOR** — meaningful degradation of correctness/UX/observability under realistic conditions; OR a documented-convention violation with concrete downstream impact.
- **MINOR** — cheap, concrete improvement with a named benefit.
- **NIT** — only admissible if (a) repeats ≥2× in the diff, (b) conflicts with a documented convention, or (c) is a one-line trivial fix.

### failure_mode contract

Every finding **must** include a `failure_mode`: one sentence on the concrete user-, oncall-, or maintainer-visible bad outcome that would occur if not fixed. Hypotheticals like "a future caller might…" do **NOT** satisfy this — drop the finding.

Litmus test before keeping any candidate: _"What is the concrete, current, product-visible cost of leaving this code in?"_ If you can't answer in one sentence, drop it.

### Do-not-raise list

Drop candidates that match. The tagged items double as the slop taxonomy for the Filter (SKILL.md) and for AntiSlop's Round 2 audit of other agents' findings (multi-agent.md), which cites the tags verbatim.

- `slop: asks for defensive guard on already-narrowed value` — speculative defensiveness at a boundary whose guarantee is actually _enforced_; a declared or cast type is not enforcement (see AntiSlop).
- `slop: hypothetical future caller — no current path` — future-caller scenarios with no current caller.
- `slop: restating-the-obvious comment request` — comment/JSDoc requests where name + signature already convey intent.
- `slop: refactor with no concrete cost-of-keeping` — abstract SOLID-style "consider extracting…" with no concrete failure mode.
- `slop: observability without named failure mode` — "add a log/metric" without the specific failure it would debug.
- `slop: test for trivially-verifiable code` — test demands on type-evident or already-exercised code.
- `slop: defends against a state the product cannot produce`.
- Style/formatting a linter or formatter covers.
- Aesthetic naming preferences — only raise names that mislead about behavior.

### Caps

6 actionable items (CRITICAL/MAJOR/MINOR) plus 8 NITs retained internally; anything beyond is "N additional items omitted; ask for the full list." High effort: each reviewer agent additionally caps its own output at 8 findings, prioritized — not exhaustive.

### suggested_fix schema (when present)

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

## Engineering (always)

For each change name a realistic input or condition that would expose a bug. If you cannot, do not raise it.

- **Declared ≠ enforced — check what actually guarantees a precondition.** When new code performs an operation that faults on a missing or malformed input (destructuring, property/array access, non-null assertion, iteration, parsing, arithmetic), do not accept a declared type, function signature, cast, or `as` as proof the input is safe — those _label_ a value, they don't _check_ it. Ask what enforces the precondition on this path: a runtime validator, a preceding explicit check, or a constructor/factory invariant. If nothing does, trace the value to its origin — it can fault on real data even though it compiles. Look at the operation that would actually throw, not only the named field beside it.
- **Asymmetric handling across sibling call sites is a likely bug, not a style nit.** When the diff guards, validates, converts, or error-wraps a value in one place but consumes the same value or shape bare elsewhere, exactly one side is usually right. Compare the call sites against each other instead of reviewing each in isolation, and resolve the inconsistency: guard missing where it's absent → bug; guard unnecessary everywhere → slop to remove.
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
- Contract/backward-compat for any consumer-visible response shape change. **If you suspect a consumer break, the finding is cross-repo — follow the cross-repo evidence policy before raising it.**

## Minimalism (always)

The smallest diff that ships the intent is the best diff.

- Unneeded abstractions, speculative generality, dead branches.
- Redundant validation, defensive code at trusted internal boundaries.
- Comments that restate code; new files/utilities that duplicate existing ones.
- Tests that exercise the framework, not behavior.
- Flags/config knobs without a concrete caller.
- Duplicated error handlers in the same scope.
- Commented-out code or dead branches.

For every "delete this" finding, `failure_mode` must state the **concrete cost of keeping the code**.

### Named-smell vocabulary

Use these names (Fowler, _Refactoring_ ch.3) to label structural findings — a shared name makes the finding legible and the fix direction obvious. Three rules bind them: a smell label alone is **not** a finding (the `failure_mode` contract still applies); a documented repo standard overrides the baseline; each is a judgement call, never a hard violation.

- **Mysterious Name** — name doesn't reveal what it does or holds → rename; if no honest name comes, the design's murky.
- **Duplicated Code** — same logic shape in more than one hunk/file of the change → extract the shared shape.
- **Feature Envy** — method reaches into another object's data more than its own → move it onto the data it envies.
- **Data Clumps** — the same few fields/params keep traveling together → bundle into one type.
- **Primitive Obsession** — a primitive standing in for a domain concept → give the concept its own small type.
- **Repeated Switches** — same `switch`/`if`-cascade on the same type recurs across the change → polymorphism or one shared map.
- **Shotgun Surgery** — one logical change forces scattered edits across many files → gather what changes together.
- **Divergent Change** — one module edited for several unrelated reasons → split by reason for change.
- **Speculative Generality** — abstraction/hooks for needs nothing has → delete; inline back until a real need shows.
- **Message Chains** — long `a.b().c().d()` navigation → hide the walk behind one method.
- **Middle Man** — a class/function that mostly delegates onward → cut it, call the target direct.
- **Refused Bequest** — implementer ignores/overrides most of what it inherits → drop inheritance, use composition.

## Conventions (always)

You are the convention owner — validate against what the repo actually documents, not a memorized list. The `@clipboard-health/ai-rules` sync drops a Coding Rules table into each consuming repo's `AGENTS.md`, mapping every rule file that repo adopted to a "When to Read" trigger — those pointers are the source of truth for which conventions apply. Consult, in order of priority:

- `git show ${context_ref}:AGENTS.md` and `CLAUDE.md` (if present). Read every rule file in the Coding Rules table whose "When to Read" trigger matches the diff, via `git show ${context_ref}:<rule-path>`.
- Neighboring files in the same module/service for in-practice patterns.
- Package READMEs in the touched paths.

Flag only violations of what those sources document — do not import conventions from other repos or from memory. One check needs no documented rule: **internal inconsistency within the diff itself** (e.g. half of imports from one package family, half from upstream; same persisted shape written three different ways across three call sites).

This lens owns all documented-rule checking, whatever domains the table covers (common, backend, frontend, data). Tag every convention finding with `[CONVENTION]` in the title. Cap severity at MAJOR (only when behavior diverges as a result) or MINOR otherwise.

## AntiSlop (always)

This PR may have been written or assisted by an LLM. For each addition, ask: _"Is this line earning its keep, or is it pattern-matching what code is supposed to look like?"_ Push back on what other lenses are too polite to flag. Apply to additions **inside the diff itself**.

- **Defensive code at trusted internal boundaries.** Null guards on private helpers whose callers' types guarantee non-null; `try`/`catch` wrapping a single non-throwing call, or that re-throws unchanged, or that "logs and swallows" without naming what to do next; optional-chaining through types that don't include optionality. **But "trusted" means the guarantee is _enforced_** — by a validator on this path, a constructor/factory invariant, or a preceding check you can point to. A type, signature, cast, or `as`/non-null-assertion only _asserts_ the guarantee; a guard backing a merely-asserted guarantee is load-bearing, not slop. Confirm what enforces the type at the call site before flagging the guard.
- **Defensiveness against unrealistic product scenarios.** Litmus: _"In the real product flow this code participates in, what user action / system event / upstream call could land us in this branch?"_ If the answer is "none" or "I had to invent one to justify the guard", it's slop. Concrete shapes:
  - Null/undefined guard on an ID immediately after that ID was used to load (and find) the entity.
  - A `null`/`undefined`/`""`/`0` branch on a field whose TypeScript or Zod/class-validator already rejects those.
  - Re-validation of a value the request DTO already validated upstream in the same lifecycle.
  - Consistency check (`if (a !== b) throw`) between two fields the data model forbids being unequal.
  - Branch for a product-impossible state.
  - Retry/fallback around an SDK call that already retries or returns a typed error.
  - `catch` for an error class statically known not to throw, or that logs+swallows.
  - "Future-proof" code path with no current `v2`.

  Don't accept "but what if upstream changes?" as a defense — that's the hypothetical-future-caller anti-pattern. The fix when upstream genuinely changes is a typed-error / schema update in that PR, not preemptive guards.

- **Restating-the-code comments.** `// fetch the user`, JSDoc on private helpers that only restates the signature, `// Note: this is important`, section banners in short files.
- **Empty scaffolding.** `// TODO` with no owner/ticket; redundant pre-conditions; debug logs that survived to the PR; default `else { return undefined; }` after exhaustive branching; `_unused` prefixes that should be deletions.
- **Speculative generality.** Helper called once that wraps two trivial lines; `Map`/`Set`/config keyed by a single hardcoded value; "strategy"/"registry" pattern with one strategy; union types whose only second case is `never`/placeholder.
- **Unused parameters/overloads/fields.** Args destructured but never read; interface methods with empty implementations; new optional fields with no producer or consumer.
- **Tests that exercise the framework, not the code.** `jest.fn().mockReturnValue(x); expect(fn()).toBe(x)`; snapshot tests with no semantic assertion; tests that mock the unit under test; test names that describe the implementation (`it("calls foo.bar"…)`) instead of behavior.
- **Dead AI breadcrumbs.** Variables whose only use is logging or debug branches; `console.log`/`console.error` that should have been removed before commit; commented-out alternative implementations.
- **Tone/description mismatch.** PR description claims behavior the diff doesn't have; variable/function names that pattern-match engineering writing without naming the role (`data`, `result`, `processed`, `_handle`, `doStuff`).

Default `suggested_fix` is **delete** (empty `after`) or **simplify** (smaller `after`). Suggesting "add a justifying comment" is itself slop — do not propose it.

Stay in your lane: do not raise items the Conventions lens owns (anything a documented rule file covers); do not demand observability, tests, or error handling that does **not** exist in the diff — you only call out what's _present_ and unnecessary; do not challenge whether the PR solves the right problem. A change that's small but unnecessary is still slop; a change that's large but earns each line is not.

## Spec (when a spec source exists)

Does the diff faithfully implement what was asked? Read the spec (issue, ticket, PRD, plan file) in full, then check:

- **Missing or partial requirements** — things the spec asked for that the diff doesn't do, or half-does.
- **Scope creep** — behavior in the diff the spec didn't ask for. (Mechanical enablers of requested behavior are fine; new user-visible behavior is not.)
- **Implemented but wrong** — requirements that look addressed but whose implementation diverges from what the spec actually says (wrong threshold, wrong actor, wrong ordering, wrong default).

Quote the spec line each finding is grounded in. Tag every finding `[SPEC]`. The `failure_mode` contract applies — the concrete cost is usually "ships behavior that diverges from what was agreed" made specific (which user, which flow, which wrong outcome). Spec findings report separately in the Summary so a standards-clean diff can't mask a spec miss.

## Security (when triggered)

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

## Database (when triggered)

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

## Frontend (when triggered)

Will this behave correctly under realistic user conditions? FE conventions (data fetching, component patterns, styling, feature flags, FE testing) are documented rules — the Conventions lens owns them via the repo's Coding Rules table; do not re-derive them from memory here. This lens owns behavior:

- Loading / empty / error states for any new data-fetching surface.
- Accessibility: keyboard navigation, ARIA roles, labels on interactive controls.
- State that survives realistic interaction: rapid re-clicks, back navigation, stale cache, concurrent mutations, slow networks.
- Render correctness with realistic data: long strings, empty lists, zero/negative values, missing optional fields.
