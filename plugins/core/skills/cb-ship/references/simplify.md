# Simplify

If the host supports it, launch three review agents concurrently, passing each the full diff. Otherwise, perform the reviews inline.

## Agents

### 1: Code reuse review

Review each change:

1. **Search for existing utilities and helpers** that could replace newly written code. Look for similar patterns elsewhere in the codebase. Common locations are utility directories, shared modules, library monorepos `cbh-core` and `core-utils`, and files adjacent to the changed ones.
2. **Flag any new function that duplicates existing functionality.** Suggest the existing function to use instead.
3. **Flag any inline logic that could use an existing utility.** Hand-rolled string manipulation, manual path handling, custom environment checks, ad-hoc type guards, and similar patterns are common candidates.

### 2: Code quality review

Review each change for hacky patterns:

1. **Redundant state** that duplicates existing state, cached values that could be derived, observers/effects that could be direct calls.
2. **Parameter sprawl**: Adding new parameters to a function instead of generalizing or restructuring existing ones.
3. **Copy-paste with slight variation**: near-duplicate code blocks that should be unified with a shared abstraction.
4. **Leaky abstractions**: exposing internal details that should be encapsulated, or breaking existing abstraction boundaries.
5. **Stringly-typed code**: using raw strings where constants, enums (string unions), or branded types already exist in the codebase.
6. **Unnecessary JSX nesting**: wrapper Boxes/elements that add no layout value. Check if inner component props (flexShrink, alignItems, etc.) already provide the needed behavior.
7. **Nested conditionals**: ternary chains (`a ? x : b ? y : ...`), nested if/else, or nested switch 3+ levels deep. Flatten with early returns, guard clauses, a lookup table, or an if/else-if cascade.
8. **Unnecessary comments**: Delete comments explaining WHAT the code does (well-named identifiers already do that), narrating the change, or referencing the task/caller. Keep only non-obvious WHY (hidden constraints, subtle invariants, workarounds).
9. **Defensive code on trusted inputs**: null/empty/type guards on inputs already guaranteed upstream (a validated DTO, the type system, a controller that already checked), optional chaining where the types guarantee presence, fallbacks that mask bugs (`?? ''`, `|| []`, `?? 0` on values that should never be absent), and try/catch that only logs and rethrows or guards an impossible state. Leave guards at genuine trust boundaries (raw request bodies, webhook payloads, third-party responses) and any error handling around real I/O, network, parsing, or payments — removing those changes behavior.
10. **Type escapes**: `as any`, `: any`, `as unknown as X`, gratuitous non-null `!`, `@ts-ignore`/`@ts-expect-error` added to dodge a type error — replace with the real type when it is determinable from the call site, the imported type, or the shape in use; if it is not, leave it and flag it rather than deleting it (breaks the build) or swapping in a TODO (more clutter).
11. **Leftover debug statements**: stray `console.log`/print-style output used to debug; keep intentional logging that goes through the repo's logger.

### 3: Efficiency review

Review each change for:

1. **Unnecessary work**: redundant computations, repeated file reads, duplicate network/API calls, N+1 patterns.
2. **Missed concurrency**: independent operations run sequentially when they could run in parallel.
3. **Hot-path bloat**: new blocking work added to startup or per-request/per-render hot paths.
4. **Recurring no-op updates**: state/store updates inside polling loops, intervals, or event handlers that fire unconditionally. Add a change-detection guard so downstream consumers aren't notified when nothing changed. If a wrapper function takes an updater/reducer callback, verify it honors same-reference returns (or whatever the "no change" signal is), otherwise callers' early-return no-ops are silently defeated.
5. **Unnecessary existence checks**: pre-checking file/resource existence before operating (TOCTOU anti-pattern); operate directly and handle the error.
6. **Memory**: unbounded data structures, missing cleanup, event listener leaks.
7. **Overly broad operations**: reading entire files when only a portion is needed, loading all items when filtering for one.

## Fix issues

Once all three reviews are complete, aggregate their findings and fix each issue directly. If a finding is a false positive or not worth addressing, note it and move on.

## Validate fixes

Find validation commands in, e.g., `AGENTS.md`, `CLAUDE.md`, `CONTRIBUTING.md`, or pre-commit/pre-push hooks and fix any failures.
